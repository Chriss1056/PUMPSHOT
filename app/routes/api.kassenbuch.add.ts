export const action = async ({ request }: { request: Request }) => {
  try {
    const entry = await request.json();
    const res = await fetch("https://scipnet.org/kassenbuch_api.php?action=add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: entry.date,
        beleg: entry.invoiceid,
        descr: entry.description,
        income: entry.input.toFixed(2),
        expense: entry.output.toFixed(2),
        payment: entry.type,
        receipt: entry.invoice ? "Ja" : "Nein",
      }),
    });
    const json = await res.json();
    return Response.json({ success: true, data: json });
  } catch (err) {
    return Response.json({ success: false, error: String(err) });
  }
};