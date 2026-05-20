import { chromium } from "playwright";
import fs from "fs";

const EMAIL = process.env.WEWORK_EMAIL;
const PASSWORD = process.env.WEWORK_PASSWORD;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Detect Cloudflare 502 page
async function is502(page, response) {
  const html = await page.content().catch(() => "");
  return (
    (response && response.status() === 502) ||
    html.includes("Bad gateway") ||
    html.includes("Error code 502")
  );
}

// Safe navigation with retries (DOES NOT crash)
async function gotoWithRetry(page, url, label, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    console.log(`➡️ ${label} attempt ${i}: ${url}`);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }).catch(() => null);

    await sleep(3000);

    if (await is502(page, response)) {
      console.log(`⚠️ 502 detected on attempt ${i}`);
      await page.screenshot({ path: `${label}-502-${i}.png`, fullPage: true });
      await sleep(5000 * i);
      continue;
    }

    await page.screenshot({ path: `${label}-ok-${i}.png`, fullPage: true });
    return true;
  }

  console.log(`⚠️ Site unavailable after retries: ${url}`);
  return false;
}

// Save HTML for debugging
async function saveHTML(page, filename) {
  const html = await page.content();
  fs.writeFileSync(filename, html);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("🔵 Starting WeWork bot...");

    // Step 1 — Open WeWork
    await gotoWithRetry(page, "https://members.wework.com/", "step1-home", 3);

    // Step 2 — Attempt login (best effort)
    console.log("🔵 Attempting login...");

    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count()) {
      await emailInput.first().fill(EMAIL);
    }

    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count()) {
      await passwordInput.first().fill(PASSWORD);
    }

    const loginButton = page.locator('button[type="submit"]');
    if (await loginButton.count()) {
      await loginButton.first().click();
    }

    await sleep(6000);
    await page.screenshot({ path: "step2-after-login.png", fullPage: true });

    // Step 3 — Go to booking page (THIS is where 502 happens)
    const ok = await gotoWithRetry(
      page,
      "https://members.wework.com/workplace/book",
      "step3-booking",
      4
    );

    if (!ok) {
      console.log("✅ Booking site down — exiting safely");
      await browser.close();
      return; // do NOT fail workflow
    }

    console.log("✅ Booking page loaded!");

    // Save HTML (so we can build selectors next)
    await saveHTML(page, "step3-booking.html");

    console.log("✅ Saved booking HTML");

    // === NEXT STEP (we will add later) ===
    // 1. Select date
    // 2. Select desk
    // 3. Click "Book Desk"

    await browser.close();

  } catch (err) {
    console.error("❌ Script error:", err);
    await page.screenshot({ path: "error.png", fullPage: true });
    await browser.close();
    process.exit(0); // DO NOT fail workflow
  }
})();
