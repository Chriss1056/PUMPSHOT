import { useEffect, useState } from "react";

export default function Index() {
  const [loading, setLoading] = useState<boolean>(true);
  const [invoice_id, setInvoiceId] = useState<string>('');
  const [order_totals, setOrderTotals] = useState<string>('');

  useEffect(() => {
    (async () => {
      await getInvoiceId();
      await getOrderTotal();
      setLoading(false);
    })();
  }, []);

  const getInvoiceId = async () => {
    try {
      const res = await fetch("api/invoiceid/get");
      const data = await res.json();
      setInvoiceId(data?.metafield?.value || "");
    } catch (err) {
      console.error("Failed to fetch invoice_id:", err);
    }
  };

  const getOrderTotal = async () => {
    try {
      const res = await fetch("api/order_totals/get");
      const data = await res.json();
      setOrderTotals(data?.total || "");
    } catch (err) {
      console.error("Failed to fetch invoice_id:", err);
    }
  };

  if (loading) {
    return (
      <s-stack direction="inline">
        <s-spinner />
      </s-stack>
    );
  }

  return (
  <s-stack gap="base">
    <s-banner heading="Development Notice" tone="warning">
      This App is still under Development.
    </s-banner>
    <s-box
      padding="base"
      background="base"
      borderWidth="base"
      borderColor="base"
      borderRadius="base"
    >
      <s-stack gap="base">
        <s-text-field value={invoice_id} label="Derzeitige Rechnungsnummer" placeholder="invoice_0123456789" autocomplete="off" readOnly></s-text-field>
        <s-text-field value={order_totals} label="Einnahmen dieses Jahr" placeholder="000000€" autocomplete="off" readOnly></s-text-field>
      </s-stack>
    </s-box>
  </s-stack>
  );
}
