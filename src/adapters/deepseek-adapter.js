// src/adapters/deepseek-adapter.js — DeepSeek model adapter
'use strict';

const BaseAdapter = require('./base-adapter');
const logger      = require('../logger');
const config      = require('../config');

/**
 * Adapter for chat.deepseek.com
 */
class DeepSeekAdapter extends BaseAdapter {
  constructor(page, config) {
    super(page, config);
    this._ensureThinkingTracker();
  }

  _ensureThinkingTracker() {
    if (this.thinkingTracker && typeof this.thinkingTracker.reset === 'function') return;
    try {
      const { ThinkingTracker } = require('../thinking');
      this.thinkingTracker = new ThinkingTracker();
    } catch {
      this.thinkingTracker = {
        reset: () => {}, update: () => {},
        get isThinking() { return false; },
        get hasThinking() { return false; },
        get thinkingContent() { return ''; },
        get responseContent() { return ''; },
      };
    }
  }

  // ── Implement Abstract Methods ─────────────────────────────────────────────

  _getInputSelectors() {
    return [
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="ask" i]',
      '#chat-input',
      '.chat-input textarea',
      'div[contenteditable="true"]',
      'textarea',
    ];
  }

  _getSendSelectors() {
    return [
      'button[aria-label*="Send" i]',
      'button[aria-label*="send" i]',
      'button[type="submit"]',
      '[data-testid="send-button"]',
      'button:has(svg):not([disabled])',
      '.send-button',
      'button[class*="send"]',
    ];
  }

  _getStopSelectors() {
    return [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="stop" i]',
      '[data-testid="stop-button"]',
      'button:has(.stop-icon)',
      'button.stop-generation',
      'button[class*="stop"]',
    ];
  }

  _getNewChatSelectors() {
    return [
      'div[role="button"]:has-text("New chat")',
      'div:has-text("New chat")',
      'button[aria-label*="New chat" i]',
      'button[aria-label*="new chat" i]',
      'a[href="/"]',
      '[data-testid="new-chat-button"]',
      '.new-chat-button',
      'button:has-text("New Chat")',
      'button:has-text("New chat")',
    ];
  }

  _getResponseSelectors() {
    return [
      '.message-content:last-child',
      '[data-message-author-role="assistant"]:last-child',
      '.assistant-message:last-child .content',
      '.chat-message:last-child .message-text',
      '.ds-markdown:last-child',
      '[class*="assistant"]:last-child',
      '.prose:last-child',
    ];
  }

  async newChat() {
    this._isFirstMessage = true;
    
    // DeepSeek's UI constantly changes its DOM selectors for the "New Chat" button.
    // The most robust way to force a new chat is to navigate directly to the root URL.
    try {
      await this.page.goto(this.getModelUrl(), { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000); // Give the SPA time to render the new session
    } catch (err) {
      // Fallback if direct navigation fails
      await super.newChat();
    }
  }

  getModelUrl() {
    return 'https://chat.deepseek.com';
  }

  // ── Overrides ──────────────────────────────────────────────────────────────

  async sendMessage(text) {
    if (!text || !text.trim()) {
      throw new Error('sendMessage: cannot send empty text');
    }

    // On first message of a new chat:
    // Prepend system prompt + project context
    let fullText = text;
    if (this._isFirstMessage) {
      try {
        const { buildSystemPrompt } = require('../system-prompt');
        const systemPrompt = buildSystemPrompt({
          projectContext: this._projectContext || '',
          profile       : this.config.ACTIVE_PROFILE  || 'default',
          planMode      : this.config.PLANNING_MODE    || false,
          workingDir    : this.config.WORKING_DIR      || process.cwd(),
          showThinking  : this.config.SHOW_THINKING    || false,
        });
        // Combine into ONE string — not two separate messages
        fullText = systemPrompt +
          '\n\n════════════════════════════════════════\n' +
          'USER TASK:\n' +
          text;
        this._isFirstMessage = false;

        logger.dim(`  Sending message (${fullText.length} chars total)`);
      } catch (e) {
        logger.warn('Could not build system prompt: ' + e.message);
        // Fall through — send just the task text
        this._isFirstMessage = false;
      }
    }

    // STEP 1: Find the input element
    const inputEl = await this._trySelectors(
      this._getInputSelectors(),
      { timeout: config.APPEAR_TIMEOUT || 20_000, visible: true }
    );

    if (!inputEl) {
      throw new Error(
        'Could not find DeepSeek chat input.\n' +
        'The UI may have changed. Run: forge-agent --calibrate'
      );
    }

    // STEP 2: Inject the COMPLETE text atomically (one operation)
    await this._typeText(inputEl, fullText);

    // STEP 3: Verify text was injected correctly
    const verifyDelay = config.SEND_DELAY || 600;
    await this.page.waitForTimeout(verifyDelay);

    const actualText = await inputEl.evaluate(el =>
      el.value || el.textContent || ''
    ).catch(() => '');

    if (!actualText || actualText.trim().length === 0) {
      // Text injection failed — try once more with keyboard approach
      logger.warn('Text injection failed — retrying with keyboard approach...');
      await inputEl.click();
      await this.page.waitForTimeout(300);
      await this.page.keyboard.press('Control+a');
      await this.page.waitForTimeout(100);
      // Type in chunks
      for (let i = 0; i < fullText.length; i += 200) {
        await this.page.keyboard.type(fullText.slice(i, i + 200), { delay: 0 });
      }
      await this.page.waitForTimeout(500);
    }

    // STEP 4: Click send button ONCE
    await this._clickSendButton();

    // STEP 5: Brief pause after send — do NOT immediately poll
    await this.page.waitForTimeout(500);

    // sendMessage is done — caller must now call waitForResponse()
  }

  /**
   * Click the send button using multiple selectors and fallbacks.
   */
  async _clickSendButton() {
    const selectors = this._getSendSelectors();

    for (const sel of selectors) {
      try {
        const btn = await this.page.$(sel);
        if (!btn) continue;

        const isVisible = await btn.isVisible();
        if (!isVisible) continue;

        const isEnabled = await btn.isEnabled();
        if (!isEnabled) {
          // Button disabled — text not ready yet
          await this.page.waitForTimeout(500);
          // Try one more time
          const stillDisabled = !await btn.isEnabled();
          if (stillDisabled) continue;
        }

        await btn.click();
        // CRITICAL: After clicking, do NOT check immediately and click again
        // Wait for button to change state (it usually disappears or becomes stop)
        await this.page.waitForTimeout(1000);
        return; // SUCCESS — exit immediately, do not try other selectors
      } catch {}
    }

    // All button selectors failed — try Enter key as fallback
    try {
      const input = await this._trySelectors(this._getInputSelectors(), { timeout: 3000 });
      if (input) {
        await input.press('Enter');
        await this.page.waitForTimeout(1000);
        return;
      }
    } catch {}

    throw new Error('Could not click send button — no send button found');
  }

  async waitForResponse() {
    this._ensureThinkingTracker();

    // Read timing from config LIVE (not cached)
    const timeout    = config.RESPONSE_TIMEOUT === 0
      ? 24 * 60 * 60 * 1000
      : (config.RESPONSE_TIMEOUT || 600_000);
    const stableMs   = config.STABLE_DELAY      || 1_500;
    const pollMs     = config.GENERATION_POLL   || 400;
    const appearMs   = config.APPEAR_TIMEOUT    || 20_000;

    const start      = Date.now();
    let lastText     = '';
    let stableStart  = null;
    let hasStarted   = false;

    // PHASE 1: Wait for DeepSeek to START generating
    const appearDeadline = Date.now() + appearMs;
    while (Date.now() < appearDeadline) {
      const isGen = await this._isCurrentlyGenerating();
      const text  = await this._extractLatestResponse();

      if (isGen || (text && text.trim().length > 0)) {
        hasStarted = true;
        logger.dim('  DeepSeek is generating...');
        break;
      }

      await this.page.waitForTimeout(pollMs);
    }

    if (!hasStarted) {
      throw new Error(
        'DeepSeek did not start generating after ' + (appearMs/1000) + 's.\n' +
        'The message may not have been sent. Check if the input is focused.'
      );
    }

    // PHASE 2: Wait for DeepSeek to FINISH generating
    while (Date.now() - start < timeout) {
      const elapsed = Date.now() - start;

      const currentText = await this._extractLatestResponse();
      logger.waiting(elapsed, currentText.length, config.MODEL || 'deepseek');

      const isGenerating = await this._isCurrentlyGenerating();

      if (!isGenerating) {
        const text = await this._extractLatestResponse();

        if (text !== lastText) {
          lastText    = text;
          stableStart = Date.now();
        } else if (stableStart && (Date.now() - stableStart) >= stableMs) {
          logger.clearWaiting();

          if (!text || text.trim().length === 0) {
            await this.page.waitForTimeout(stableMs);
            const retryText = await this._extractLatestResponse();
            if (!retryText || retryText.trim().length === 0) {
              throw new Error('DeepSeek returned an empty response.');
            }
            return this._processResponse(retryText);
          }

          return this._processResponse(text);
        }
      } else {
        const text = await this._extractLatestResponse();
        if (text !== lastText) {
          lastText    = text;
          stableStart = null;
        }
      }

      await this.page.waitForTimeout(pollMs);
    }

    logger.clearWaiting();
    const partialText = await this._extractLatestResponse();
    if (partialText && partialText.trim().length > 0) {
      logger.warn(`Response timeout — using partial response (${partialText.length} chars)`);
      return this._processResponse(partialText);
    }
    throw new Error(`Response timeout after ${timeout/1000}s with no content.`);
  }

  async _isCurrentlyGenerating() {
    for (const sel of this._getStopSelectors()) {
      try {
        const el = await this.page.$(sel);
        if (el && await el.isVisible()) return true;
      } catch {}
    }
    return false;
  }

  async _extractLatestResponse() {
    for (const sel of this._getResponseSelectors()) {
      try {
        const elements = await this.page.$$(sel);
        if (elements.length === 0) continue;
        const last = elements[elements.length - 1];
        const text = await last.innerText().catch(() => '');
        if (text && text.trim()) return text.trim();
      } catch {}
    }
    return '';
  }

  _processResponse(text) {
    if (!text) return '';
    if (!config.SHOW_THINKING) {
      this._ensureThinkingTracker();
      this.thinkingTracker.update(text);
      return this.thinkingTracker.responseContent || text;
    }
    return text;
  }

  async _extractText(selectors) {
    const text = await super._extractText(selectors);
    if (text && this.thinkingTracker) {
      this.thinkingTracker.update(text);
    }
    return text;
  }
}

module.exports = DeepSeekAdapter;