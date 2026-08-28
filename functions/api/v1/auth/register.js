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
    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400 });
    }

    // Check if user already exists
    let existingUser = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    let user;
    if (existingUser) {
      if (existingUser.password_hash !== null && existingUser.password_hash !== undefined && existingUser.password_hash !== "") {
        return new Response(JSON.stringify({ error: "Email is already registered" }), { status: 400 });
      }
      const hashedPassword = await hashPassword(password);
      await env.DB.prepare(
        "UPDATE users SET password_hash = ? WHERE id = ?"
      ).bind(hashedPassword, existingUser.id).run();
      user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(existingUser.id).first();
    } else {
      const hashedPassword = await hashPassword(password);
      // Create user with 1 free credit
      await env.DB.prepare(
        "INSERT INTO users (email, password_hash, credits) VALUES (?, ?, ?)"
      ).bind(email, hashedPassword, 1).run();
      user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
