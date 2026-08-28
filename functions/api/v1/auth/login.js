async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email, password } = await request.json();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: "Valid email required" }), { status: 400 });
    }
    if (!password) {
      return new Response(JSON.stringify({ error: "Password required" }), { status: 400 });
    }

    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 });
    }

    // Since older users might not have a password_hash, we need to handle that gracefully.
    if (!user.password_hash) {
      return new Response(JSON.stringify({ error: "This account was created without a password. Please create a new account or contact support." }), { status: 401 });
    }

    const hashedPassword = await hashPassword(password);
    if (user.password_hash !== hashedPassword) {
      return new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 });
    }

    // Create session
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    await env.DB.prepare(
      "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).bind(user.id, token, expiresAt).run();

    // Set cookie
    const cookie = `omni_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`;

    return new Response(JSON.stringify({ success: true, user: { email: user.email, credits: user.credits }, betaMode: env.BETA_MODE === "true" }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie
      }
    });

  } catch (err) {
    console.error("Login Error:", err);
    return new Response(JSON.stringify({ error: "An error occurred during login." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
