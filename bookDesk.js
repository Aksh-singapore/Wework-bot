import { chromium } from 'playwright';

const EMAIL = process.env.WEWORK_EMAIL;
const PASSWORD = process.env.WEWORK_PASSWORD;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("🔵 Opening WeWork...");

  await page.goto("https://members.wework.com/");
  await page.waitForTimeout(5000);

  // Screenshot for debugging
  await page.screenshot({ path: "step1-home.png" });

  console.log("🔵 Attempting login...");

  // Try common login fields
  const emailInput = await page.locator('input[type="email"]').first();
  if (await emailInput.isVisible()) {
    await emailInput.fill(EMAIL);
  }

  const passwordInput = await page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible()) {
    await passwordInput.fill(PASSWORD);
  }

  const loginButton = page.locator('button[type="submit"]');
  if (await loginButton.count()) {
    await loginButton.first().click();
  }

  await page.waitForTimeout(8000);

  await page.screenshot({ path: "step2-after-login.png" });

  console.log("✅ Login step finished (check screenshots)");

  await page.goto("https://members.wework.com/workplace/book");
  await page.waitForTimeout(5000);

  await page.screenshot({ path: "step3-booking.png" });

  console.log("✅ Reached booking page");

  await browser.close();
})();
