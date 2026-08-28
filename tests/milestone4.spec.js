const { test, expect } = require('./helpers');

test.describe('Milestone 4: Checkout, Webhooks & Paywall Integration', () => {
  
  test('should handle graceful registration and reject duplicate email with password', async ({ request }) => {
    // 1. Pre-register a user with NULL password_hash by simulating a Stripe webhook
    const mockSessionId = `mock_reg_${Date.now()}`;
    const email = `pre-reg-${Date.now()}@example.com`;
    
    // Send a Stripe webhook event to pre-create the user
    const webhookRes = await request.post('/api/v1/stripe-webhook', {
      data: {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: mockSessionId,
            customer_details: { email },
            customer_email: email
          }
        }
      }
    });
    expect(webhookRes.ok()).toBeTruthy();
    const webhookJson = await webhookRes.json();
    expect(webhookJson.received).toBe(true);

    // 2. Perform register call for this email. It should complete registration
    const registerRes = await request.post('/api/v1/auth/register', {
      data: { email, password: 'password123' }
    });
    expect(registerRes.ok()).toBeTruthy();
    const registerJson = await registerRes.json();
    expect(registerJson.success).toBe(true);
    expect(registerJson.user.email).toBe(email);
    // User should have 25 (purchased) + 1 (trial/graceful) = 26 credits
    expect(registerJson.user.credits).toBe(26);
    expect(registerJson.betaMode).toBe(false);

    // 3. Try to register again with the same email. It should fail
    const duplicateRes = await request.post('/api/v1/auth/register', {
      data: { email, password: 'newpassword123' }
    });
    expect(duplicateRes.status()).toBe(400);
    const duplicateJson = await duplicateRes.json();
    expect(duplicateJson.error).toBe('Email is already registered');
  });

  test('should verify betaMode exposed in auth check and login endpoints', async ({ request }) => {
    const email = `beta-test-${Date.now()}@example.com`;
    const password = 'password123';

    // Register
    const regRes = await request.post('/api/v1/auth/register', {
      data: { email, password }
    });
    expect(regRes.ok()).toBeTruthy();
    const regJson = await regRes.json();
    expect(regJson.betaMode).toBe(false);

    // Login
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email, password }
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginJson = await loginRes.json();
    expect(loginJson.betaMode).toBe(false);

    // Me
    const meRes = await request.get('/api/v1/auth/me', {
      headers: {
        'Cookie': loginRes.headers()['set-cookie']
      }
    });
    expect(meRes.ok()).toBeTruthy();
    const meJson = await meRes.json();
    expect(meJson.authenticated).toBe(true);
    expect(meJson.betaMode).toBe(false);
  });

  test('should verify idempotent Stripe webhook and prevent double-crediting', async ({ request }) => {
    const email = `webhook-idempotent-${Date.now()}@example.com`;
    const sessionId = `mock_session_${Date.now()}`;

    // First Webhook call
    const res1 = await request.post('/api/v1/stripe-webhook', {
      data: {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            customer_details: { email }
          }
        }
      }
    });
    expect(res1.ok()).toBeTruthy();
    const json1 = await res1.json();
    expect(json1.received).toBe(true);
    expect(json1.duplicated).toBeUndefined();

    // Second Webhook call with exact same session ID
    const res2 = await request.post('/api/v1/stripe-webhook', {
      data: {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            customer_details: { email }
          }
        }
      }
    });
    expect(res2.ok()).toBeTruthy();
    const json2 = await res2.json();
    expect(json2.received).toBe(true);
    expect(json2.duplicated).toBe(true);
  });

  test('should verify frontend paywall transition, stripe prefilled link and polling', async ({ page, request }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Go to home page
    await page.goto('/');

    // 2. Click "Get Started Free" and Register
    await page.click('#btn-getstarted');
    const email = `e2e-paywall-${Date.now()}@example.com`;
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'password123');
    await page.click('#btn-register');

    // Wait for auth modal to close
    await expect(page.locator('#auth-modal')).toBeHidden();

    // User starts with 1 credit
    await expect(page.locator('#credit-count')).toHaveText('1');

    // 3. Perform a guide generation (uses up the 1 credit)
    await page.fill('#prompt-input', '2015 Honda Civic replace outer tie rod end');
    await page.click('#generate-btn');
    await expect(page.locator('#results-section')).toBeVisible({ timeout: 15000 });
    
    // Credits should now be 0
    await expect(page.locator('#credit-count')).toHaveText('0');

    // 4. Try generating again. It should block with the billing modal because credits are 0
    await page.fill('#prompt-input', '2015 Honda Civic replace front brake pads');
    await page.click('#generate-btn');

    // Billing modal should show
    await expect(page.locator('#billing-modal')).toBeVisible();

    // Prefilled email on stripe link should be visible in href
    const stripeLink = page.locator('#btn-stripe-checkout');
    await expect(stripeLink).toHaveAttribute('href', new RegExp(`prefilled_email=${encodeURIComponent(email)}`));

    // 5. Simulate Stripe purchase webhook processing in background
    const mockSessionId = `mock_purchase_${Date.now()}`;
    const webhookRes = await request.post('/api/v1/stripe-webhook', {
      data: {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: mockSessionId,
            customer_details: { email },
            customer_email: email
          }
        }
      }
    });
    expect(webhookRes.ok()).toBeTruthy();

    // 6. Polling should detect the credit update, close modal, and trigger the pending generation
    // Pending generation completes and results are visible
    await expect(page.locator('#billing-modal')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#results-section')).toBeVisible({ timeout: 15000 });
    
    // Credits remaining should be 25 runs (25 + 0 - 1 generated = 24 runs)
    await expect(page.locator('#credit-count')).toHaveText('24');
  });

});
