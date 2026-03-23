import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// ——— Helpers ———

function moneyBag(amount: number, currencyCode = "EUR") {
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
  const countryLine = (lines[2] || "").toLowerCase();

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
  };

  return {
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    address1,
    zip: zipMatch?.[1] || "",
    city: zipMatch?.[2] || cityLine,
    countryCode: countryMap[countryLine] || "AT",
  };
}

function mapFinancialStatus(paymentType: string): "PAID" | "PENDING" {
  const paidTypes = ["onlinezahlung", "bar", "sumup"];
  return paidTypes.includes(paymentType.toLowerCase()) ? "PAID" : "PENDING";
}

function buildOrderInput(
  items: Item[],
  totals: Total,
  data: Data,
  invoiceId: string,
) {
  const lineItems = items.map((item) => {
    const discountFactor =
      item.allowDiscount && item.discount > 0
        ? 1 - item.discount / 100
        : 1;

    const effectiveUnitNet = +(item.net * discountFactor).toFixed(2);
    const taxRate = item.tax / 100;
    const lineTaxTotal = +(
      effectiveUnitNet *
      taxRate *
      item.quantity
    ).toFixed(2);

    return {
      title: item.description,
      quantity: item.quantity,
      priceSet: moneyBag(effectiveUnitNet),
      requiresShipping: false,
      taxable: item.tax > 0,
      ...(item.tax > 0 && {
        taxLines: [
          {
            title: `USt. ${item.tax}%`,
            rate: taxRate,
            priceSet: moneyBag(lineTaxTotal),
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
            gateway: data.paymenttype || "manual",
            amountSet: moneyBag(totals.totalGross),
          },
        ]
      : [];

  return {
    sourceName: "pumpshot-invoice",
    currency: "EUR" as const,
    taxesIncluded: false,
    financialStatus,

    lineItems,
    ...(transactions.length > 0 && { transactions }),

    email: data.email || undefined,

    tags: ["generated-order"],

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
        namespace: "PUMPSHOT",
        key: "invoice_id",
        value: invoiceId,
        type: "single_line_text_field",
      },
    ],

    billingAddress: parseAddress(data.customerName, data.customerAddress),
  };
}

// ——— Mutation ———

const ORDER_CREATE_MUTATION = `#graphql
  mutation orderCreate($order: OrderCreateOrderInput!) {
    orderCreate(order: $order) {
      order {
        id
        name
        metafield(namespace: "PUMPSHOT", key: "invoice_id") {
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
    const orderInput = buildOrderInput(items, totals, data, invoice_id);

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