const { test, expect } = require('./helpers');

test.describe('Advanced Parts & Tools Logic and Badging', () => {
  test('should register, generate guide, and verify correct badge styling and ordering', async ({ page }) => {
    // Log console messages from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Load the home page
    await page.goto('/');

    // 2. Click "Get Started Free"
    await page.click('#btn-getstarted');

    // 3. Register a user
    const email = `test-${Date.now()}@example.com`;
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'password123');
    await page.click('#btn-register');

    // Wait for the auth modal to close, indicating successful registration
    await expect(page.locator('#auth-modal')).toBeHidden({ timeout: 10000 });

    // Verify registration error is empty (just in case)
    const regError = await page.locator('#register-error').textContent();
    if (regError) {
      console.error('Registration failed with error:', regError);
    }

    // 4. Verify logged in status and that credits are updated
    await expect(page.locator('#credit-count')).toHaveText('1');
    await expect(page.locator('#credit-display')).toContainText('Runs Left');

    // 5. Fill out the repair prompt and generate course
    await page.fill('#prompt-input', '2015 Honda Civic replace outer tie rod end');
    await page.click('#generate-btn');

    // 6. Wait for the loading state to complete and results section to be visible
    await expect(page.locator('#results-section')).toBeVisible({ timeout: 15000 });

    // 7. Verify the parts list contains RockAuto as prioritized link with 'cheapest' badge
    const firstPartLink = page.locator('#res-parts li.checklist-item .store-links a.store-btn').first();
    await expect(firstPartLink).toContainText('RockAuto');
    await expect(firstPartLink).toHaveAttribute('title', /RockAuto — Often cheapest/);
    
    const cheapestBadge = firstPartLink.locator('span.store-note-badge.cheapest');
    await expect(cheapestBadge).toBeVisible();
    await expect(cheapestBadge).toHaveText('Often cheapest');

    // Verify ordering for parts
    const partLinks = page.locator('#res-parts li.checklist-item .store-links a.store-btn');
    await expect(partLinks.nth(0)).toContainText('RockAuto');
    await expect(partLinks.nth(1)).toContainText('AutoZone');
    await expect(partLinks.nth(2)).toContainText("O'Reilly");
    await expect(partLinks.nth(3)).toContainText('NAPA');
    await expect(partLinks.nth(4)).toContainText('Amazon');

    // 8. Verify the tools list contains Harbor Freight as prioritized link with 'budget' badge
    const firstToolLink = page.locator('#res-tools li.checklist-item .store-links a.store-btn').first();
    await expect(firstToolLink).toContainText('Harbor Freight');
    await expect(firstToolLink).toHaveAttribute('title', /Harbor Freight — Budget-friendly/);

    const budgetBadge = firstToolLink.locator('span.store-note-badge.budget');
    await expect(budgetBadge).toBeVisible();
    await expect(budgetBadge).toHaveText('Budget-friendly');

    // Verify ordering for tools
    const toolLinks = page.locator('#res-tools li.checklist-item .store-links a.store-btn');
    await expect(toolLinks.nth(0)).toContainText('Harbor Freight');
    await expect(toolLinks.nth(1)).toContainText('Amazon');
    await expect(toolLinks.nth(2)).toContainText('Home Depot');
    await expect(toolLinks.nth(3)).toContainText("Lowe's");
  });
});
