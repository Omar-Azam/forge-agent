// src/browser.js — Playwright controller for model-specific adapters
'use strict';

const { chromium } = require('playwright');
const path         = require('path');
const config       = require('./config');
const logger       = require('./logger');
const { Errors }   = require('./errors');
const { getAdapter, getModelUrl } = require('./adapter-factory');
const { runHealthCheckWithReAuth } = require('./health');

// ─────────────────────────────────────────────────────────────────────────────
//  DeepSeekBrowser class
// ─────────────────────────────────────────────────────────────────────────────

class DeepSeekBrowser {
  constructor() {
    this.context  = null;
    this.page     = null;
    this._closed  = false;
    this.adapter  = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async launch() {
    logger.info(`Launching browser for ${config.MODEL} with persistent session...`);

    const sessionDir = path.resolve(config.SESSION_DIR);

    this.context = await chromium.launchPersistentContext(sessionDir, {
      headless      : config.HEADLESS,
      viewport      : { width: 1280, height: 900 },
      userAgent     : [
        'Mozilla/5.0 (X11; Linux x86_64)',
        'AppleWebKit/537.36 (KHTML, like Gecko)',
        'Chrome/124.0.0.0 Safari/537.36',
      ].join(' '),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-default-apps',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Grab existing page or open a new one
    const pages   = this.context.pages();
    this.page     = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Mask automation signals
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Initialize model adapter
    this.adapter = getAdapter(config.MODEL, this.page, config);

    await this._navigate(getModelUrl(config.MODEL));

    // Run full session health check — handles login re-auth automatically
    await runHealthCheckWithReAuth(this.page, this.adapter, config, async () => {
      this._printLoginBanner();
      await this._waitForEnter();
    });

    logger.success('Browser ready!');
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try { await this.context?.close(); } catch {}
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async _navigate(url) {
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.BROWSER_TIMEOUT || 90_000 });
      await this.page.waitForTimeout(3_000);
    } catch (err) {
      logger.warn(`Navigation warning: ${err.message}`);
    }
  }

  async newChat() {
    if (!this.adapter) throw new Error('Browser not initialized');
    return await this.adapter.newChat();
  }

  // ── Login handling ─────────────────────────────────────────────────────────

  _printLoginBanner() {
    console.log('');
    logger.warn('╔══════════════════════════════════════════════╗');
    logger.warn('║  🔐  LOGIN REQUIRED                          ║');
    logger.warn('║                                              ║');
    logger.warn(`║  1. Log in to ${config.MODEL} in the browser    ║`);
    logger.warn('║  2. Return here and press  ENTER  to continue║');
    logger.warn('╚══════════════════════════════════════════════╝');
    console.log('');
  }

  async _waitForEnter() {
    return new Promise(resolve => {
      const stdin   = process.stdin;
      const wasRaw  = stdin.isRaw;
      const wasPaused = !stdin.readable;

      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.resume();

      const handler = chunk => {
        const s = chunk.toString();
        if (s.includes('\n') || s.includes('\r')) {
          stdin.removeListener('data', handler);
          if (stdin.isTTY && wasRaw) stdin.setRawMode(true);
          if (wasPaused)            stdin.pause();
          resolve();
        }
      };

      stdin.on('data', handler);
    });
  }

  // ── Sending Messages ───────────────────────────────────────────────────────

  async sendMessage(text) {
    if (!this.adapter) throw new Error('Browser not initialized');
    
    try {
      return await this.adapter.sendMessage(text);
    } catch (firstErr) {
      const msg = firstErr.message.toLowerCase();
      // If it looks like a selector error or timeout, wait and retry once
      if (msg.includes('not found') || msg.includes('selector') || msg.includes('timeout')) {
        logger.warn('Send failed — waiting 3s and retrying...');
        await this.page.waitForTimeout(3000);
        
        try {
          return await this.adapter.sendMessage(text);
        } catch (secondErr) {
          // Take debug screenshot on final failure
          try {
            const debugPath = '/tmp/forge-selector-debug.png';
            await this.page.screenshot({ path: debugPath });
            logger.dim(`Debug screenshot saved: ${debugPath}`);
          } catch (e) {}
          throw secondErr;
        }
      }
      throw firstErr;
    }
  }

  // ── Waiting for Response ───────────────────────────────────────────────────

  async waitForResponse() {
    if (!this.adapter) throw new Error('Browser not initialized');
    return await this.adapter.waitForResponse();
  }

  // ── Debug / Calibration Utilities ─────────────────────────────────────────

  /**
   * Dump useful DOM information to stdout.
   */
  async dumpDebugInfo() {
    const info = await this.page.evaluate(() => {
      const classFreq = {};
      document.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => {
          if (c.match(/message|chat|input|send|stop|markdown|content|assistant|user|bot/i)) {
            classFreq[c] = (classFreq[c] || 0) + 1;
          }
        });
      });

      const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable]')).map(e => ({
        tag         : e.tagName,
        id          : e.id || null,
        class       : e.className?.slice(0, 80) || null,
        placeholder : e.placeholder || null,
        editable    : e.isContentEditable,
        visible     : e.offsetParent !== null,
      }));

      return {
        url    : window.location.href,
        title  : document.title,
        classes: Object.entries(classFreq).sort((a, b) => b[1] - a[1]).slice(0, 40),
        inputs,
      };
    });

    console.log('\n' + '═'.repeat(60));
    console.log('  DOM DEBUG INFO');
    console.log('═'.repeat(60));
    console.log('URL   :', info.url);
    console.log('Title :', info.title);
    console.log('\nInput elements:');
    info.inputs.forEach(i => console.log(' ', JSON.stringify(i)));
    console.log('\nMatching CSS classes (by frequency):');
    info.classes.forEach(([cls, count]) => console.log(`  ${String(count).padStart(3)}x  .${cls}`));
    console.log('═'.repeat(60) + '\n');
  }

  /** Take a screenshot (for debugging) */
  async screenshot(filePath = '/tmp/forge-agent-debug.png') {
    await this.page.screenshot({ path: filePath, fullPage: false });
    logger.info(`Screenshot saved: ${filePath}`);
  }
}

module.exports = DeepSeekBrowser;
