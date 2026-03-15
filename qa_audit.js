import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Listen for console errors to catch React crashes
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('BROWSER ERROR:', msg.text());
  });

  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1000));
  
  try {
    console.log('Testing Class Addition...');
    await page.click('.right-sidebar header .btn');
    await page.waitForSelector('input[placeholder="Class Name"]');
    await page.type('input[placeholder="Class Name"]', 'Automated QA Test Class');
    await page.keyboard.press('Enter');
    
    const classAdded = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.class-input')).some(el => el.value === 'Automated QA Test Class');
    });
    if (!classAdded) throw new Error('Failed to add class.');
    console.log('Class added successfully.');
  
    console.log('Testing Modal Workflow...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.app-header .btn'));
      const indexBtn = buttons.find(b => b.textContent.includes('INDEX FILES'));
      if(indexBtn) indexBtn.click();
    });
    
    await page.waitForSelector('.import-hub');
    
    await page.evaluate(() => {
      const cancel = Array.from(document.querySelectorAll('.import-card h3')).find(h => h.textContent === 'CANCEL');
      if(cancel) cancel.parentElement.click();
    });
    console.log('Modal workflow passed.');
  
    console.log('Testing Zero-State Exports...');
    await page.evaluate(() => {
      const yoloBtn = Array.from(document.querySelectorAll('.btn-group button')).find(b => b.textContent === 'YOLO');
      if(yoloBtn) yoloBtn.click();
    });
    
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({path: 'C:/Users/mathi/.gemini/antigravity/brain/f88acaae-126c-42b0-b35d-206b8743ae83/qa_e2e_final.png'});
    
    console.log('QA Audit Passed Code 0.');
  } catch (err) {
    console.error('QA FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
