import { authenticate } from "../shopify.server";

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

export const action = async ({ request }: { request: Request }) => {
  const { admin } = await authenticate.admin(request);

  const body = await request.json();
  const { incommingValue } = body;

  const year = new Date().getFullYear();
  
  if (typeof incommingValue !== 'string' || !incommingValue.includes('-')) {
    throw new Error('Invalid incommingValue format:', incommingValue);
  }

  const parts = incommingValue.split('-');
  
  if (parts.length !== 2) {
    throw new Error('incommingValue should have exactly one hyphen');
  }

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
  
  const prepQuery = `
    query GetShopId {
      shop {
        id
      }
    }
  `;
  const response = await admin.graphql(prepQuery);
  const data = await response.json();
  const id = data?.data?.shop?.id;
  
  const mutation = `
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

  const updateResponse = await admin.graphql(mutation, {
    variables: { namespace: NAMESPACE, key: KEY, value: value, id: id },
  });
  const updateData = await updateResponse.json();

  const errors = updateData?.data?.metafieldsSet?.userErrors || [];

  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400, headers: { 'Access-Control-Allow-Origin': 'https://extensions.shopifycdn.com' } });
  }

  return Response.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': 'https://extensions.shopifycdn.com' } });
};
