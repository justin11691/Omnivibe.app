export async function onRequest(context) {
  const { request, env } = context;

  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const token = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith("omni_session="))?.split("=")[1];
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    }
  }

  // Clear cookie
  const cookie = `omni_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie
    }
  });
}
