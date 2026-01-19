import {render} from 'preact';
import { useEffect, useState } from 'preact/hooks';

interface OrderQueryResponse {
  order: {
    sourceName: string;
  } | null;
}

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const {data, query} = shopify;
  const order_id = data.selected[0].id;
  
  const [loading, setLoading] = useState<boolean>(true);
  const [allow_generation, setAllow_generation] = useState<boolean>(false);
  const [invoice_id, setInvoice_id] = useState<string>('');

  const checkIfPOS = async () => {
    const query_string = `
      query OrderSource($orderId: ID!) {
        order(id: $orderId) {
          sourceName
        }
      }
    `;
    const response = await query<OrderQueryResponse, { orderId: string }>(query_string, { variables: { orderId: order_id } });
    if (response?.data?.order?.sourceName != "pos") {
      setAllow_generation(true);
    }
  }

  const getInvoiceId = async () => {
    try {
      const res = await fetch("api/invoiceid/order", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: order_id }),
      });
      const id_data = await res.json();
      setInvoice_id(id_data?.metafield?.value || "No Invoice Id provided!");
    } catch (err) {
      console.error("Failed to fetch invoice_id:", err);
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      await getInvoiceId();
      setLoading(false);
      await checkIfPOS();
    })();
  }, [order_id]);

  const handlePdfButton = async () => {
    setLoading(true);
    open("apps/pumpshot/autorechnungsgenerator?order_id=" + order_id, "_self",);
  };

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
              <s-text>{order_id.split('/').pop()}</s-text>
            </s-grid>
            <s-grid gridTemplateColumns="1fr auto">
              <s-text>Invoice ID:</s-text>
              <s-text>{invoice_id}</s-text>
            </s-grid>
            {allow_generation && (
            <s-stack direction="inline" justifyContent="end">
              <s-button onClick={handlePdfButton} variant="primary" icon="check" accessibilityLabel="PDF Generieren">PDF Generieren</s-button>
            </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-stack>
    </s-admin-block>
  );
}
