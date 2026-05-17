const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  console.log("Launching Chromium...");
  const browser = await puppeteer.launch({
    executablePath: '/snap/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Listen for console events
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER EXCEPTION] ${err.toString()}`);
  });

  page.on('requestfailed', request => {
    console.error(`[REQUEST FAILED] ${request.url()} - ${request.failure().errorText}`);
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.error(`[HTTP ERROR] ${response.url()} - Status ${response.status()}`);
    } else {
      console.log(`[HTTP SUCCESS] ${response.url()} - Status ${response.status()}`);
    }
  });

  console.log("Navigating to login.html...");
  await page.goto('http://localhost:8080/login.html', { waitUntil: 'networkidle0' });

  // Check global variables
  const globals = await page.evaluate(() => {
    return {
      SUPABASE_URL: typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'undefined',
      SUPABASE_ANON_KEY: typeof SUPABASE_ANON_KEY !== 'undefined' ? 'defined' : 'undefined',
      authLogin: typeof authLogin !== 'undefined' ? 'defined' : 'undefined'
    };
  });
  console.log("Globals on page load:", globals);

  console.log("Filling login credentials...");
  await page.type('#email', 'test@example.com');
  await page.type('#password', 'wrongpassword');

  console.log("Clicking Sign In button...");
  await page.click('button[type="submit"]');
  
  console.log("Waiting for network and UI updates...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get the error message text and visibility
  const errorState = await page.evaluate(() => {
    const errorEl = document.getElementById('login-error');
    return {
      text: errorEl ? errorEl.textContent : 'Not found',
      display: errorEl ? window.getComputedStyle(errorEl).display : 'Not found'
    };
  });
  console.log("Error element state after click:", errorState);

  // Take screenshot
  console.log("Taking screenshot...");
  await page.screenshot({ path: 'login-screenshot.png' });
  console.log("Screenshot saved as login-screenshot.png");

  await browser.close();
})().catch(err => {
  console.error("Test failed: ", err);
});
