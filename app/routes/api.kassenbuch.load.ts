export const action = async () => {
  try {
    const res = await fetch("https://scipnet.org/kassenbuch_api.php?action=load");
    const json = await res.json();

    let balance = 0;
    const chronological = [...json].sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const data = chronological.map((e: any) => {
      const input = parseFloat(e.income);
      const output = parseFloat(e.expense);
      balance = parseFloat((balance + input - output).toFixed(2));
      return {
        id: e.id,
        date: e.date,
        invoiceid: e.beleg,
        description: e.descr,
        input,
        output,
        type: e.payment,
        endbalance: balance,
        invoice: e.receipt === "Ja",
      };
    });

    return Response.json({ success: true, data: data.reverse() });
  } catch (err) {
    return Response.json({ success: false, data: [] });
  }
};