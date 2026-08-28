export async function onRequest(context) {
  const { request, env } = context;

  // Always return 200 so the frontend's res.ok check works cleanly
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const tokenPair = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith("omni_session="));
  const token = tokenPair ? tokenPair.substring("omni_session=".length) : null;

  if (!token) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // Validate session
    const session = await env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    ).bind(token).first();

    if (!session) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get user
    const user = await env.DB.prepare("SELECT email, credits FROM users WHERE id = ?").bind(session.user_id).first();
    if (!user) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ authenticated: true, user: { email: user.email, credits: user.credits }, betaMode: env.BETA_MODE === "true" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    // On DB error, return unauthenticated rather than crashing the app load
    return new Response(JSON.stringify({ authenticated: false, error: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
