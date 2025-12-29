import {render} from 'preact';
import { useEffect, useState } from 'preact/hooks';

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;
  const order_id = data.selected[0].id;
  
  const [loading, setLoading] = useState(true);
  const [invoice_id, setInvoice_id] = useState();
  
  useEffect(() => {
    (async function getOrderInfo() {
      const query = {
        query: `
          query GetOrderMetafield($namespace: String!, $key: String!, $orderId: ID!) {
            order(id: $orderId) {
              metafield(namespace: $namespace, key: $key) {
                value
              }
            }
          }
        `,
        variables: {
          namespace: NAMESPACE,
          key: KEY,
          orderId: order_id
        }
      };
      const response = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(query),
      });
      if (!response.ok) {
        console.error("Network error");
      }
      const response_data = await response.json();
      setInvoice_id(response_data?.data?.order?.metafield?.value);
      setLoading(false);
    })();
  }, [order_id]);

  if (loading) {
    return (
      <s-admin-block heading="Rechnungsdownload">
        <s-stack direction="inline">
          <s-spinner />
        </s-stack>
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading="Rechnungsdownload">
      <s-stack gap="base">
        <s-box
          padding="base"
          background="base"
          borderWidth="base"
          borderColor="base"
          borderRadius="base"
        >
          <s-stack gap="base">
            <s-grid gridTemplateColumns="1fr auto">
              <s-text>Order ID:</s-text>
              <s-text>{order_id}</s-text>
            </s-grid>
            <s-grid gridTemplateColumns="1fr auto">
              <s-text>Invoice ID:</s-text>
              <s-text>{invoice_id}</s-text>
            </s-grid>
            <s-stack direction="inline" justifyContent="end">
              <s-button variant="primary" icon="check" accessibilityLabel="PDF Generieren">PDF Generieren</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>
    </s-admin-block>
  );
}