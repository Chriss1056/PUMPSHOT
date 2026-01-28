import { authenticate } from "../shopify.server";

const NAMESPACE = "pumpshot";
const KEY_YEAR = "manual_total_" + new Date().getFullYear().toString();

export const loader = async ({ request }: { request: Request }) => {
  const { cors, admin } = await authenticate.admin(request);

  const query_meta = `
    query GetInvoiceMetafield($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) {
          id
          value
        }
      }
    }
  `;

  const response_meta = await admin.graphql(query_meta, {
    variables: { namespace: NAMESPACE, key: KEY_YEAR },
  });
  const data_meta = await response_meta.json();

  let metafield = data_meta?.data?.shop?.metafield;

  if (!metafield) {
    const prepQuery_meta = `
      query GetShopId {
        shop {
          id
        }
      }
    `;
    const response_meta = await admin.graphql(prepQuery_meta);
    const data_meta = await response_meta.json();
    const id_meta = data_meta?.data?.shop?.id;
    const mutation_meta = `
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

    const createResponse_meta = await admin.graphql(mutation_meta, {
      variables: { namespace: NAMESPACE, key: KEY_YEAR, value: ("0"), id: id_meta.toString() },
    });
    const createData_meta = await createResponse_meta.json();
    metafield = createData_meta?.data?.metafieldsSet?.metafields?.[0];
  }

  const query = `
    query TotalSalesAllTime {
      shopifyqlQuery(query: "FROM sales SHOW total_sales SINCE startOfYear(0y) UNTIL today") {
        tableData {
          rows
        }
        parseErrors
      }
    }
  `;
  const response = await admin.graphql(query);
  const data = await response.json();
  const order_total = data?.data?.shopifyqlQuery?.tableData?.rows?.[0]?.total_sales;

  const total = Number(order_total + metafield?.value).toFixed(2) + '€';

  return cors(Response.json({ total }));
};
