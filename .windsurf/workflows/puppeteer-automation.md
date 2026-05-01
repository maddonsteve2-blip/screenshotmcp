---
description: Expert guidance for browser automation using Puppeteer with best practices for web scraping, testing, screenshot capture, and JavaScript execution in headless Chrome.
---

Expert guidance for Puppeteer browser automation.

For the full skill with complete API examples, read `~/.agents/skills/puppeteer-automation/SKILL.md`.

## Key Principles

- Write clean async/await code
- Proper error handling with try/catch
- Robust waiting strategies for dynamic content
- Always close browser instances in finally blocks
- Use `waitForSelector` before interacting with elements
- Prefer `networkidle2` over `networkidle0` for faster loads
- Use stealth plugin for anti-bot bypass
- Monitor memory in long-running scripts

## Quick Reference

```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

try {
  const page = await browser.newPage();
  await page.goto('https://example.com', { waitUntil: 'networkidle2' });
  // automation code
} finally {
  await browser.close();
}
```

## Key Dependencies

- puppeteer / puppeteer-core
- puppeteer-cluster (parallel scraping)
- puppeteer-extra + puppeteer-extra-plugin-stealth (anti-detection)
