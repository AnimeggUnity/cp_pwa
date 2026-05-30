const puppeteer = require('puppeteer-core');
const fs = require('fs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Starting headless browser test...');
  const browser = await puppeteer.launch({
    executablePath: '/snap/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Catch console logs
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    
    // Catch alerts
    page.on('dialog', async dialog => {
      console.log('BROWSER ALERT:', dialog.message());
      await dialog.accept();
    });
    
    console.log('Navigating to local site http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    
    // Wait for HMR/Vite
    await sleep(1500);

    // Wait for the sidebar to load and click on "員工名冊管理"
    console.log('Clicking on Employee Roster tab...');
    const buttons = await page.$$('nav button');
    let employeeTabButton = null;
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('員工名冊管理')) {
        employeeTabButton = btn;
        break;
      }
    }
    
    if (!employeeTabButton) {
      throw new Error('Could not find Employee Roster tab button!');
    }
    
    await employeeTabButton.click();
    await sleep(1500);
    
    // Wait for the restore button input
    console.log('Locating file input...');
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error('Could not find file input element!');
    }
    
    console.log('Uploading backup file...');
    await fileInput.uploadFile('/home/ubuntu/Downloads/員工資料庫備份_2026-05-29 .json');
    
    console.log('Waiting for import process to complete...');
    await sleep(3500);
    
    // Take a screenshot
    const screenshotPath = '/home/ubuntu/.gemini/antigravity-ide/brain/9dd01641-742a-4bb7-9695-86b7bdc7cbe8/screenshot.png';
    console.log('Taking screenshot...');
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved successfully to ${screenshotPath}`);
    
    // Check if the employees are loaded in the page
    const employeesCountText = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('span'));
      const target = elements.find(el => el.textContent.includes('人'));
      return target ? target.textContent : 'Not found';
    });
    console.log('Employees count displayed on page:', employeesCountText);
    
  } catch (err) {
    console.error('Test crashed with error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
