/*import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, admin } = await authenticate.webhook(request);
    
  if (!session) {
    throw Response.json({ ok: true });
  }
  let query = null;
  let response = null;
  let data = null;
  let errors = null;

  const order_gid = payload.admin_graphql_api_id;
  
  query = `
    query OrderSource($orderId: ID!) {
      order(id: $orderId) {
        sourceName
      }
    }
  `;
  response = await admin.graphql(query, {
    variables: { orderId: order_gid }
  });
  data = await response.json();
  query = null;
  response = null;
  if (data?.data?.order?.sourceName == "pos") {
    data = null;
    return Response.json({ ok: true });
  }
  data = null;


  query = `
    query GetShopId {
      shop {
        id
      }
    }
  `;
  response = await admin.graphql(query);
  data = await response.json();
  const shop_gid = data?.data?.shop?.id;
  query = null;
  response = null;
  data = null;

  query = `
    query GetInvoiceMetafield($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) {
          id
          value
        }
      }
    }
  `;
  response = await admin.graphql(query, {
    variables: { namespace: NAMESPACE, key: KEY },
  });
  data = await response.json();
  const invoice_id = data?.data?.shop?.metafield?.value;
  query = null;
  response = null;
  data = null;

  query = `
    mutation SetOrderMetafield($namespace: String!, $key: String!, $orderId: ID!, $value: String!) {
      metafieldsSet(metafields: [
        {
          type: "single_line_text_field"
          namespace: $namespace
          key: $key
          ownerId: $orderId
          value: $value
        }
      ]) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  response = await admin.graphql(query, {
    variables: { namespace: NAMESPACE, key: KEY, orderId: order_gid, value: invoice_id },
  });
  data = await response.json();
  errors = data?.data?.metafieldsSet?.userErrors || [];
  query = null;
  response = null;
  data = null;

  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 });
  }
  errors = null;
  
  const year = new Date().getFullYear();
  const parts = invoice_id.split('-');
  const validate = parseInt(parts[0]);
  let value: string = "";

  if (validate !== year) {
    value = year.toString() + "-00001";
  } else {
    const oldVal = parseInt(parts[1]);

    if (isNaN(oldVal)) {
      throw new Error('Invalid number after hyphen in incommingValue');
    }

    value = parts[0] + "-" + (oldVal + 1).toString().padStart(5, "0");
  }

  query = `
    mutation UpdateInvoiceMetafield($namespace: String!, $key: String!, $value: String!, $id: ID!) {
      metafieldsSet(metafields: [{
        namespace: $namespace,
        key: $key,
        value: $value,
        type: "single_line_text_field",
        ownerId: $id,
      }]) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  response = await admin.graphql(query, {
    variables: { namespace: NAMESPACE, key: KEY, value: value, id: shop_gid },
  });
  data = await response.json();
  errors = data?.data?.metafieldsSet?.userErrors || [];
  query = null;
  response = null;
  data = null;

  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 });
  }
  errors = null;

  return Response.json({ ok: true });
};
*/
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

// ────────────────────────────────────────────────────────
//  In-process async mutex
// ────────────────────────────────────────────────────────

let _lockChain: Promise<void> = Promise.resolve();

async function withInvoiceLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = _lockChain;
  _lockChain = gate;
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

// ────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────

function fiscalYear(): number {
  return parseInt(
    new Date().toLocaleDateString("de-AT", {
      timeZone: "Europe/Vienna",
      year: "numeric",
    }),
    10,
  );
}

function computeNextInvoiceId(lastAssigned: string | null | undefined): string {
  const year = fiscalYear();
  if (!lastAssigned) return `${year}-00001`;

  const [yearStr, seqStr] = lastAssigned.split("-");
  const idYear = parseInt(yearStr, 10);
  const idSeq = parseInt(seqStr, 10);

  if (isNaN(idYear) || isNaN(idSeq) || idYear !== year) {
    return `${year}-00001`;
  }
  return `${year}-${String(idSeq + 1).padStart(5, "0")}`;
}

// ────────────────────────────────────────────────────────
//  GraphQL fragments (each #graphql on its OWN line)
// ────────────────────────────────────────────────────────

const ORDER_INVOICE_CHECK = `
  #graphql
  query OrderInvoiceCheck($id: ID!, $ns: String!, $key: String!) {
    order(id: $id) {
      metafield(namespace: $ns, key: $key) {
        value
      }
    }
  }
`;

const SHOP_ID_QUERY = `
  #graphql
  query ShopId {
    shop {
      id
    }
  }
`;

const SHOP_COUNTER_QUERY = `
  #graphql
  query ShopCounter($ns: String!, $key: String!) {
    shop {
      metafield(namespace: $ns, key: $key) {
        value
      }
    }
  }
`;

const METAFIELDS_SET = `
  #graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// ────────────────────────────────────────────────────────
//  Shared metafield writer
// ────────────────────────────────────────────────────────

async function setMetafield(
  admin: AdminApiContext,
  ownerId: string,
  value: string,
): Promise<void> {
  const res = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: NAMESPACE,
          key: KEY,
          type: "single_line_text_field",
          value,
        },
      ],
    },
  });
  const json = await res.json();
  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `metafieldsSet failed for ${ownerId}: ${JSON.stringify(errors)}`,
    );
  }
}

// ────────────────────────────────────────────────────────
//  Webhook handler
// ────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, admin } = await authenticate.webhook(request);

  if (!session || !admin) {
    return new Response(null, { status: 200 });
  }

  if (payload.source_name === "pos") {
    return Response.json({ ok: true });
  }

  const orderGid: string | undefined = payload.admin_graphql_api_id;
  if (!orderGid) {
    console.error("[invoice] payload missing admin_graphql_api_id");
    return Response.json({ ok: true });
  }

  // ── Idempotency check ──
  const checkRes = await admin.graphql(ORDER_INVOICE_CHECK, {
    variables: { id: orderGid, ns: NAMESPACE, key: KEY },
  });
  const checkJson = await checkRes.json();
  const existing = checkJson.data?.order?.metafield?.value;
  if (existing) {
    console.log(`[invoice] order ${orderGid} already has ${existing}, skipping`);
    return Response.json({ ok: true, invoiceId: existing });
  }

  // ── Resolve shop GID ──
  const shopRes = await admin.graphql(SHOP_ID_QUERY);
  const shopJson = await shopRes.json();
  const shopGid: string = shopJson.data.shop.id;

  // ── Allocate + assign inside the mutex ──
  try {
    const invoiceId = await withInvoiceLock(async () => {
      // 1. Read current counter
      const ctrRes = await admin.graphql(SHOP_COUNTER_QUERY, {
        variables: { ns: NAMESPACE, key: KEY },
      });
      const ctrJson = await ctrRes.json();
      const lastAssigned: string | undefined =
        ctrJson.data?.shop?.metafield?.value;

      // 2. Compute next id
      const nextId = computeNextInvoiceId(lastAssigned);

      // 3. Advance shop counter FIRST (gap > duplicate)
      await setMetafield(admin, shopGid, nextId);

      // 4. Stamp the order
      await setMetafield(admin, orderGid, lastAssigned as string);

      return nextId;
    });

    console.log(`[invoice] assigned ${invoiceId} to ${orderGid}`);
    return Response.json({ ok: true, invoiceId });
  } catch (err) {
    console.error("[invoice] allocation failed:", err);
    return new Response(null, { status: 500 });
  }
};