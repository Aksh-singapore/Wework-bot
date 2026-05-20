import { chromium } from "playwright";
import fs from "fs";

const EMAIL = process.env.WEWORK_EMAIL;
const PASSWORD = process.env.WEWORK_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Missing WEWORK_EMAIL / WEWORK_PASSWORD secrets.");
  process.exit(2);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function looksLikeCloudflare502(page, resp) {
  const status = resp ? resp.status() : null;
  const html = await page.content().catch(() => "");
  const isCF = html.toLowerCase().includes("cloudflare");
  const isBadGateway = html.toLowerCase().includes("bad gateway") || html.includes("Error code 502");
  return status === 502 || (isCF && isBadGateway);
}

async function gotoWithRetry(page, url, label, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    console.log(`➡️ goto [${label}] attempt ${i}: ${url}`);
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(3000);

    if (await looksLikeCloudflare502(page, resp)) {
      await page.screenshot({ path: `${label}-502-attempt-${i}.png`, fullPage: true });
      console.log(`⚠️ Cloudflare/Host 502 detected at ${url}`);
      // retry quickly inside the same run
      await sleep(5000 * i);
      continue;
    }

    // success path: save a screenshot for debugging
    await page.screenshot({ path: `${label}-ok-attempt-${i}.png`, fullPage: true });
    return resp;
  }

  throw new Error(`Site unavailable after retries: ${url}`);
}

async function saveHtml(page, filename) {
  const html = await page.content();
  fs.writeFileSync(filename, html, "utf8");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Entry path A: members portal (may 502 sometimes)
    let reachedLogin = false;
    try {
      await gotoWithRetry(page, "https://members.wework.com/", "step1-members-home", 3);
      reachedLogin = true;
    } catch (e) {
      console.log("ℹ️ members.wework.com is unstable right now, trying Account Central route…");
    }

    // Entry path B: Account Central route (WeWork doc says Member Portal is accessible from Account Central)
    // Ref: “Click your Account Central user icon > Member Portal … Member log in …” [3](https://wecompany.my.site.com/help/s/article/New-Account-Central-How-do-I-access-the-Member-Web-Portal-to-book-space?language=en_US)
    if (!reachedLogin) {
      await gotoWithRetry(page, "https://accounts.wework.com/login", "step1-account-central", 3);
      // We don’t assume exact UI; we just proceed to attempt member web booking page next.
    }

    // Try to reach booking directly (this is where you hit 502 in your screenshot)
    await gotoWithRetry(page, "https://members.wework.com/workplace/book", "step3-booking", 4);

    // If we get here, booking page actually loaded (not 502)
    await saveHtml(page, "step3-booking.html");
    console.log("✅ Booking page loaded (saved step3-booking.html).");

    // NEXT: select date + desk + confirm
    // We’ll add these selectors after we see the real booking DOM (not a 502 page).

  } catch (err) {
    console.error("❌ Run failed:", err.message || err);
    try { await page.screenshot({ path: "step99-error.png", fullPage: true }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
