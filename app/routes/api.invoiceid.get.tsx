import { authenticate } from "../shopify.server";

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

export const loader = async ({ request }: { request: Request }) => {
  const { admin } = await authenticate.admin(request);

  const query = `
    query GetInvoiceMetafield($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) {
          id
          value
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { namespace: NAMESPACE, key: KEY },
  });
  const data = await response.json();

  let metafield = data?.data?.shop?.metafield;

  if (!metafield) {
    const year = new Date().getFullYear();
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
      mutation CreateInvoiceMetafield($namespace: String!, $key: String!, $value: String!, $id: ID!) {
        metafieldsSet(metafields: [{
          namespace: $namespace,
          key: $key,
          value: $value,
          type: "single_line_text_field",
          ownerId: $id
        }]) {
          metafields {
            id
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createResponse = await admin.graphql(mutation, {
      variables: { namespace: NAMESPACE, key: KEY, value: (year.toString() + "-00001"), id: id.toString() },
    });
    const createData = await createResponse.json();
    metafield = createData?.data?.metafieldsSet?.metafields?.[0];
  }

  return Response.json({ metafield }, { headers: { 'Access-Control-Allow-Origin': 'https://extensions.shopifycdn.com' } });
};
