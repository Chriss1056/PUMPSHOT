import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// ——— Helpers ———

function moneyBag(amount: number, currencyCode: string) {
  const m = { amount: amount.toFixed(2), currencyCode };
  return { shopMoney: m, presentmentMoney: m };
}

function parseAddress(customerName: string, customerAddress: string) {
  const lines = customerAddress
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const nameParts = customerName.trim().split(/\s+/);

  const address1 = lines[0] || "";
  const cityLine = lines[1] || "";
  const countryLine = (lines[2] || "").toLowerCase().trim();

  const zipMatch = cityLine.match(/^(\d{4,5})\s+(.+)$/);

  const countryMap: Record<string, string> = {
    österreich: "AT",
    austria: "AT",
    deutschland: "DE",
    germany: "DE",
    schweiz: "CH",
    switzerland: "CH",
    italien: "IT",
    italy: "IT",
    frankreich: "FR",
    france: "FR",
    niederlande: "NL",
    netherlands: "NL",
    spanien: "ES",
    spain: "ES",
    tschechien: "CZ",
    "czech republic": "CZ",
    czechia: "CZ",
    ungarn: "HU",
    hungary: "HU",
    slowenien: "SI",
    slovenia: "SI",
    slowakei: "SK",
    slovakia: "SK",
    polen: "PL",
    poland: "PL",
    belgien: "BE",
    belgium: "BE",
    luxemburg: "LU",
    luxembourg: "LU",
    dänemark: "DK",
    denmark: "DK",
    schweden: "SE",
    sweden: "SE",
    norwegen: "NO",
    norway: "NO",
    finnland: "FI",
    finland: "FI",
    portugal: "PT",
    griechenland: "GR",
    greece: "GR",
    irland: "IE",
    ireland: "IE",
    kroatien: "HR",
    croatia: "HR",
    rumänien: "RO",
    romania: "RO",
    bulgarien: "BG",
    bulgaria: "BG",
  };

  const resolved = countryMap[countryLine];

  if (!resolved && countryLine.length > 0) {
    console.warn(
      `Unknown country "${countryLine}" in address for "${customerName}". Falling back to "AT".`,
    );
  }

  return {
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    address1,
    zip: zipMatch?.[1] || "",
    city: zipMatch?.[2] || cityLine,
    countryCode: resolved || "AT",
  };
}

function parseDate(input: string): string {
  // Already ISO format (YYYY-MM-DD or full ISO string)
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // European format: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const match = input.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  console.warn(`Could not parse date "${input}", falling back to now.`);
  return new Date().toISOString();
}

function mapFinancialStatus(paymentType: string): "PAID" | "PENDING" {
  const paidTypes = ["onlinezahlung", "bar", "sumup"];
  return paidTypes.includes(paymentType.toLowerCase()) ? "PAID" : "PENDING";
}

function mapGateway(paymentType: string): string {
  const map: Record<string, string> = {
    onlinezahlung: "shopify_payments",
    bar: "cash",
    sumup: "sumup",
  };
  return map[paymentType.toLowerCase()] || "manual";
}

function buildOrderInput(
  items: Item[],
  totals: Total,
  data: Data,
  invoiceId: string,
  shopCurrency: string,
) {
  const lineItems = items.map((item) => {
    const discountFactor =
      item.allowDiscount && item.discount > 0
        ? 1 - item.discount / 100
        : 1;

    const effectiveUnitNet = +(item.net * discountFactor).toFixed(2);
    const taxRate = item.tax / 100;
    const lineNetTotal = +(effectiveUnitNet * item.quantity).toFixed(2);
    const lineTaxTotal = +(lineNetTotal * taxRate).toFixed(2);

    const computedLineGross = +(lineNetTotal + lineTaxTotal).toFixed(2);
    if (Math.abs(computedLineGross - item.lineTotalGross) > 0.02) {
      console.warn(
        `Line total mismatch for "${item.description}": ` +
          `computed ${computedLineGross} vs expected ${item.lineTotalGross}`,
      );
    }

    return {
      title: item.description,
      quantity: item.quantity,
      priceSet: moneyBag(effectiveUnitNet, shopCurrency),
      requiresShipping: false,
      taxable: item.tax > 0,
      ...(item.tax > 0 && {
        taxLines: [
          {
            title: `USt. ${item.tax}%`,
            rate: taxRate,
            priceSet: moneyBag(lineTaxTotal, shopCurrency),
          },
        ],
      }),
    };
  });

  const financialStatus = mapFinancialStatus(data.paymenttype);

  const transactions =
    financialStatus === "PAID"
      ? [
          {
            kind: "SALE" as const,
            status: "SUCCESS" as const,
            gateway: mapGateway(data.paymenttype),
            amountSet: moneyBag(totals.totalGross, shopCurrency),
          },
        ]
      : [];

  const trimmedEmail = data.email?.trim() || undefined;

  return {
    sourceName: "pumpshot-invoice",
    processedAt: parseDate(data.invoiceDate),
    currency: shopCurrency,
    taxesIncluded: false,
    financialStatus,

    lineItems,
    ...(transactions.length > 0 && { transactions }),

    email: trimmedEmail,

    tags: ["generated-order", `invoice_id_${invoiceId}`],

    customAttributes: [
      { key: "invoice_id", value: invoiceId },
      { key: "order_number", value: data.orderNumber },
      { key: "invoice_date", value: data.invoiceDate },
      { key: "delivery_date", value: data.deliveryDate },
      { key: "payment_type", value: data.paymenttype },
      { key: "customer_number", value: data.customerNumber },
      { key: "reference", value: data.refrence },
      { key: "customer_uid", value: data.customerUID },
      { key: "hint", value: data.hint },
    ],

    metafields: [
      {
        namespace: "pumpshot",
        key: "invoice_id",
        value: invoiceId,
        type: "single_line_text_field",
      },
    ],

    billingAddress: parseAddress(data.customerName, data.customerAddress),
  };
}

// ——— Queries & Mutations ———

const SHOP_CURRENCY_QUERY = `#graphql
  query shopCurrency {
    shop {
      currencyCode
    }
  }
`;

const EXISTING_ORDER_QUERY = `#graphql
  query existingOrder($query: String!) {
    orders(first: 1, query: $query) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

const ORDER_CREATE_MUTATION = `#graphql
  mutation orderCreate($order: OrderCreateOrderInput!) {
    orderCreate(order: $order) {
      order {
        id
        name
        metafield(namespace: "pumpshot", key: "invoice_id") {
          id
          namespace
          key
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ——— Helpers for JSON responses ———

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ——— Action ———

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  const { items, totals, data, invoice_id } = body as {
    items: Item[];
    totals: Total;
    data: Data;
    invoice_id: string;
  };

  try {
    // 1. Get shop currency
    const shopRes = await admin.graphql(SHOP_CURRENCY_QUERY);
    const shopResult = await shopRes.json();
    const shopCurrency: string =
      shopResult.data?.shop?.currencyCode ?? "EUR";

    // 2. Check for duplicate order
    const dupRes = await admin.graphql(EXISTING_ORDER_QUERY, {
      variables: { query: `tag:invoice_id_${invoice_id}` },
    });
    const dupResult = await dupRes.json();
    const existingOrder = dupResult.data?.orders?.edges?.[0]?.node;

    if (existingOrder) {
      return jsonResponse(
        {
          success: false,
          errors: [
            {
              field: "invoice_id",
              message: `Order already exists: ${existingOrder.name} (${existingOrder.id})`,
            },
          ],
        },
        409,
      );
    }

    // 3. Create order
    const orderInput = buildOrderInput(
      items,
      totals,
      data,
      invoice_id,
      shopCurrency,
    );

    const response = await admin.graphql(ORDER_CREATE_MUTATION, {
      variables: { order: orderInput },
    });

    const result = await response.json();

    if (result.data?.orderCreate?.userErrors?.length > 0) {
      return jsonResponse(
        { success: false, errors: result.data.orderCreate.userErrors },
        422,
      );
    }

    return jsonResponse({
      success: true,
      order: result.data.orderCreate.order,
    });
  } catch (err: unknown) {
    console.error("orderCreate failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        errors: [{ field: "general", message }],
      },
      500,
    );
  }
}