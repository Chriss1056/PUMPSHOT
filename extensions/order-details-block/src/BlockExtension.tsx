import {render} from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;
  const order_id = data.selected[0].id;
  
  const [loading, setLoading] = useState(true);
  const [invoice_id, setInvoice_id] = useState<string>('');
  
  const getInvoiceId = async () => {
    try {
      const res = await fetch("api/invoiceid/get");
      const id_data = await res.json();
      setInvoice_id(id_data?.metafield?.value || "");
    } catch (err) {
      console.error("Failed to fetch invoice_id:", err);
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      await getInvoiceId();
      setLoading(false);
    })();
  }, [order_id]);

  const handlePdfButton = async () => {
    setLoading(true);
    await generateInvoicePdf();
    await getInvoiceId();
    setLoading(false);
  };

  const generateInvoicePdf = async (): Promise<number> => {
    try {
      const response = await fetch('/api/invoicepdf/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: order_id }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to generate invoice:', error);
        return 1;
      }

      const invoiceId = response.headers.get('X-Invoice-Id') || 'RE';

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Rechnung_${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return 0;
    } catch (error) {
      console.error('Error generating invoice:', error);
      return 1;
    }
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
              <s-text>{order_id}</s-text>
            </s-grid>
            <s-grid gridTemplateColumns="1fr auto">
              <s-text>Invoice ID:</s-text>
              <s-text>{invoice_id}</s-text>
            </s-grid>
            <s-stack direction="inline" justifyContent="end">
              <s-button onClick={handlePdfButton} variant="primary" icon="check" accessibilityLabel="PDF Generieren">PDF Generieren</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>
    </s-admin-block>
  );
}