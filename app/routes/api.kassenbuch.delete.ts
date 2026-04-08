export const action = async ({ request }: { request: Request }) => {
  try {
    const { id } = await request.json();
    const res = await fetch("https://scipnet.org/kassenbuch_api.php?action=delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    return Response.json({ success: true, data: json });
  } catch (err) {
    return Response.json({ success: false, error: String(err) });
  }
};