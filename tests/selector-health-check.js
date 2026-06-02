#!/usr/bin/env node
// tests/selector-health-check.js — Day 3: Live DeepSeek selector validator
//
// Unlike the unit tests in browser.test.js (which mock Playwright), this
// script opens a REAL browser, loads chat.deepseek.com, and checks every
// selector in the SEL bank actually finds elements on the live page.
//
// Run with:
//   node tests/selector-health-check.js
//
// Output:
//   ✓ / ✗ for every selector
//   A summary table of which groups are healthy vs broken
//   An exit code of 1 if any critical selector group has zero working selectors
//
'use strict';

const { chromium } = require('playwright');
const path         = require('path');
const os           = require('os');
const fs           = require('fs');

const SESSION_DIR  = path.join(os.homedir(), '.deepseek-agent', 'session');
const DEEPSEEK_URL = 'https://chat.deepseek.com';

// ─────────────────────────────────────────────
//  Selector banks (mirrors src/browser.js SEL)
//  Keep these in sync with the real SEL object.
// ─────────────────────────────────────────────

const SEL = {
  chatInput: [
    '#chat-input',
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ],
  sendButton: [
    'button[aria-label*="Send" i]',
    'button[aria-label*="send" i]',
    '[data-testid="send-button"]',
    'button[type="submit"]',
    '[class*="send-btn"]',
    '[class*="sendBtn"]',
    '[class*="send-button"]',
  ],
  stopButton: [
    'button[aria-label*="Stop" i]',
    '[aria-label*="stop generating" i]',
    '[data-testid="stop-button"]',
    '[class*="stop-btn"]',
    '[class*="stopBtn"]',
  ],
  newChat: [
    'button[aria-label*="New chat" i]',
    'button[aria-label*="New conversation" i]',
    'a[href="/"][aria-label]',
    '[data-testid="new-chat"]',
    '[class*="new-chat"]',
    '[class*="newChat"]',
  ],
  messageContainer: [
    '[class*="chat-content"]',
    '[class*="message-list"]',
    '[class*="conversation"]',
    'main',
  ],
};

// ─────────────────────────────────────────────
//  ANSI colors
// ─────────────────────────────────────────────
const A = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  red    : '\x1b[31m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  cyan   : '\x1b[36m',
  gray   : '\x1b[90m',
};
const c = (code, t) => A[code] + t + A.reset;

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

async function run() {
  console.log('');
  console.log(c('bold', '🔬  DeepSeek Selector Health Check'));
  console.log(c('gray', '    Validates all browser.js SEL selectors against the live page'));
  console.log('');

  // Ensure session directory exists
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless : false,
    viewport : { width: 1280, height: 900 },
  });

  const pages = context.pages();
  const page  = pages.length > 0 ? pages[0] : await context.newPage();

  console.log(c('cyan', '  → Navigating to ' + DEEPSEEK_URL + '...'));
  await page.goto(DEEPSEEK_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3_000);

  // Check if we need to log in
  const needsLogin = await page.evaluate(() => {
    const url = window.location.href;
    const body = document.body?.innerText || '';
    return url.includes('/auth') || url.includes('/login') ||
           body.includes('Sign in') || body.includes('Log in');
  });

  if (needsLogin) {
    console.log('');
    console.log(c('yellow', '  ⚠  Login required — please log in to DeepSeek in the browser window'));
    console.log(c('yellow', '     then press ENTER here to continue the health check...'));
    console.log('');
    await waitForEnter();
    await page.waitForTimeout(2_000);
  }

  // ── Run health checks ────────────────────────────────────────────────────
  const results  = {};
  let   anyFail  = false;

  for (const [group, selectors] of Object.entries(SEL)) {
    console.log(c('bold', '\n  ' + group));
    results[group] = { passed: 0, failed: 0, broken: [] };

    for (const sel of selectors) {
      const found = await page.evaluate((s) => {
        try {
          const els = document.querySelectorAll(s);
          return els.length;
        } catch {
          return -1; // invalid selector syntax
        }
      }, sel);

      if (found > 0) {
        console.log('    ' + c('green', '✓') + '  ' + c('gray', sel) + '  ' + c('green', '(' + found + ' element' + (found > 1 ? 's' : '') + ')'));
        results[group].passed++;
      } else if (found === -1) {
        console.log('    ' + c('red', '✗') + '  ' + c('gray', sel) + '  ' + c('red', '(invalid selector syntax)'));
        results[group].failed++;
        results[group].broken.push(sel);
      } else {
        console.log('    ' + c('red', '✗') + '  ' + c('gray', sel) + '  ' + c('red', '(0 matches)'));
        results[group].failed++;
        results[group].broken.push(sel);
      }
    }
  }

  // ── Summary table ────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(55));
  console.log(c('bold', '  SUMMARY'));
  console.log('─'.repeat(55));

  const criticalGroups = ['chatInput', 'sendButton'];

  for (const [group, r] of Object.entries(results)) {
    const isCritical = criticalGroups.includes(group);
    const status     = r.passed > 0
      ? c('green', '✓ HEALTHY')
      : isCritical
        ? c('red', '✗ BROKEN (CRITICAL)')
        : c('yellow', '⚠ BROKEN');

    console.log('  ' + group.padEnd(20) + status +
      c('gray', '  (' + r.passed + '/' + (r.passed + r.failed) + ' selectors work)'));

    if (r.passed === 0) anyFail = true;
  }

  console.log('─'.repeat(55));

  // ── Recommendations ────────────────────────────────────────────────────
  const brokenCritical = criticalGroups.filter(g => results[g]?.passed === 0);
  if (brokenCritical.length > 0) {
    console.log('');
    console.log(c('red', '  ✗ CRITICAL SELECTORS BROKEN: ' + brokenCritical.join(', ')));
    console.log(c('yellow', '  → Run: node src/calibrate.js'));
    console.log(c('yellow', '    to auto-detect the new selectors and update src/browser.js\n'));
  } else if (anyFail) {
    console.log('');
    console.log(c('yellow', '  ⚠ Some non-critical selectors are broken.'));
    console.log(c('yellow', '    The agent will still work but with reduced reliability.'));
    console.log(c('yellow', '    Consider running: node src/calibrate.js\n'));
  } else {
    console.log('');
    console.log(c('green', '  ✓ All selectors healthy — agent is ready to use!\n'));
  }

  // ── Save report ─────────────────────────────────────────────────────────
  const reportPath = path.join(os.tmpdir(), 'dsa-selector-health.json');
  const report = {
    timestamp : new Date().toISOString(),
    url       : await page.evaluate(() => window.location.href),
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(c('gray', '  Report saved: ' + reportPath));
  console.log('');

  await context.close();
  process.exit(anyFail && brokenCritical.length > 0 ? 1 : 0);
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

run().catch(err => {
  console.error(c('red', '\n  Fatal error: ' + err.message));
  process.exit(1);
});
