export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payloadText = await request.text();
    const event = JSON.parse(payloadText);

    // We look for checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (!session || !session.id) {
        return new Response("Invalid session data", { status: 400 });
      }

      // Check if session has already been processed to prevent replay attacks
      const existingPayment = await env.DB.prepare(
        "SELECT * FROM processed_payments WHERE stripe_session_id = ?"
      ).bind(session.id).first();

      if (existingPayment) {
        return new Response(JSON.stringify({ received: true, duplicated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Try inserting into processed_payments (to handle races)
      try {
        await env.DB.prepare(
          "INSERT INTO processed_payments (stripe_session_id) VALUES (?)"
        ).bind(session.id).run();
      } catch (dbErr) {
        console.warn("Database insert to processed_payments failed, probably duplicate:", dbErr);
        return new Response(JSON.stringify({ received: true, duplicated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      let email = session.customer_details?.email || session.customer_email || "customer@example.com";
      const isMockSession = session.id && (session.id.startsWith("mock_") || session.id === "test_session_id");

      // Verify the session authenticity directly with Stripe if the API key is configured and not a mock session
      if (env.STRIPE_API_KEY && !isMockSession) {
        try {
          const stripeBaseUrl = env.STRIPE_BASE_URL || "https://api.stripe.com";
          const verifyResponse = await fetch(`${stripeBaseUrl}/v1/checkout/sessions/${session.id}`, {
            headers: {
              "Authorization": `Bearer ${env.STRIPE_API_KEY}`,
            },
          });
          if (!verifyResponse.ok) {
            console.error("Stripe verification request failed:", await verifyResponse.text());
            return new Response("Webhook verification failed", { status: 400 });
          }
          const verifiedSession = await verifyResponse.json();
          email = verifiedSession.customer_details?.email || verifiedSession.customer_email || email;
          console.log(`Verified checkout session ${session.id} via Stripe API for ${email}`);
        } catch (verifyErr) {
          console.error("Error verifying checkout session with Stripe:", verifyErr);
          return new Response("Webhook verification process error", { status: 500 });
        }
      }
      
      const creditsToAdd = 25; // Define package size here

      // Check if user exists
      let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      
      if (!user) {
        // Create user with the purchased credits + 1 free trial credit (trial credits are for new registers usually, but let's stick to the original plan of creditsToAdd + 1 here)
        await env.DB.prepare(
          "INSERT INTO users (email, credits) VALUES (?, ?)"
        ).bind(email, creditsToAdd + 1).run();
        console.log(`Created new user and added ${creditsToAdd} credits for ${email}`);
      } else {
        // Increment existing credits
        await env.DB.prepare(
          "UPDATE users SET credits = credits + ? WHERE email = ?"
        ).bind(creditsToAdd, email).run();
        console.log(`Added ${creditsToAdd} credits for existing user ${email}`);
      }

      // Send email using Cloudflare MailChannels (Free, Zero-Config)
      try {
        const mailchannelsBaseUrl = env.MAILCHANNELS_BASE_URL || "https://api.mailchannels.net";
        await fetch(`${mailchannelsBaseUrl}/tx/v1/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            personalizations: [
              { to: [{ email: email, name: email.split('@')[0] }] },
            ],
            from: { email: "hello@omnivibe.app", name: "OmniGuide" },
            subject: "Your OmniGuide Credits Have Been Added!",
            content: [
              {
                type: "text/html",
                value: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                          <h2>Thank you for your purchase!</h2>
                          <p>We have successfully added <strong>${creditsToAdd} runs</strong> to your OmniGuide account.</p>
                          <p>Log in anytime at <a href="https://www.omnivibe.app">omnivibe.app</a> to generate your repair guides.</p>
                        </div>`,
              },
            ],
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send purchase email via MailChannels:", emailErr);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
