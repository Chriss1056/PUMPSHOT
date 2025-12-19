import type { ActionFunctionArgs } from "react-router";
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

  const order_gid = payload.admin_graphql_api_id;

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
