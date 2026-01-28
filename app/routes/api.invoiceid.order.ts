import { authenticate } from "../shopify.server";

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

export const loader = async ({ request }: { request: Request }) => {
  const { cors } = await authenticate.admin(request);
  return cors(Response.json({}));
}

export const action = async ({ request }: { request: Request }) => {
  const { cors, admin } = await authenticate.admin(request);

  const body = await request.json();
  const { order_id } = body;

  const query = `
    query GetOrderMetafield($namespace: String!, $key: String!, $orderId: ID!) {
      order(id: $orderId) {
        metafield(namespace: $namespace, key: $key) {
          value
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { namespace: NAMESPACE, key: KEY, orderId: order_id },
  });
  const data = await response.json();

  let metafield = data?.data?.order?.metafield;

  if (!metafield) {
    metafield =  null;
  }

  return cors(Response.json({ metafield }));
};
