const puppeteer = require('puppeteer-core');

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

  console.log("Navigating to login.html...");
  await page.goto('http://localhost:8080/login.html', { waitUntil: 'networkidle0' });

  console.log("Filling login credentials...");
  await page.type('#email', 'test@example.com');
  await page.type('#password', 'wrongpassword');

  console.log("Clicking Sign In button...");
  // Click the submit button
  await page.click('button[type="submit"]');
  
  // Wait a few seconds for async fetch to complete
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log("Test finished.");
  await browser.close();
})().catch(err => {
  console.error("Test failed: ", err);
});
