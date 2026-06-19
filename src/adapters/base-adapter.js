// src/adapters/base-adapter.js — Abstract base class for model adapters
'use strict';

const logger = require('../logger');

/**
 * Base class for model adapters.
 * Defines the interface and provides shared utilities.
 */
class BaseAdapter {
  /**
   * @param {Object} page - Playwright page object
   * @param {Object} config - Configuration object
   */
  constructor(page, config) {
    this.page = page;
    this.config = config;
  }

  // ── Abstract Methods (subclasses MUST implement) ──────────────────────────

  _getInputSelectors() { throw new Error('_getInputSelectors() not implemented'); }
  _getSendSelectors()  { throw new Error('_getSendSelectors() not implemented'); }
  _getStopSelectors()  { throw new Error('_getStopSelectors() not implemented'); }
  _getNewChatSelectors() { throw new Error('_getNewChatSelectors() not implemented'); }
  _getResponseSelectors() { throw new Error('_getResponseSelectors() not implemented'); }
  getModelUrl() { throw new Error('getModelUrl() not implemented'); }

  /**
   * Set project context for injection into the first message.
   */
  setProjectContext(context) {
    this._projectContext = context || '';
  }

  // ── Concrete Methods (subclasses may override) ─────────────────────────────

  /**
   * Return true if the page is ready for input.
   */
  async isReady() {
    const input = await this._trySelectors(this._getInputSelectors(), { timeout: 5000 });
    return !!input;
  }

  /**
   * Start a new chat session.
   */
  async newChat() {
    await this._clickElement(this._getNewChatSelectors(), { timeout: 10000 });
    await this.page.waitForTimeout(2000);
  }

  /**
   * Send a message to the AI.
   */
  async sendMessage(text) {
    let fullText = text;

    // On first message: prepend system prompt
    if (this._isFirstMessage) {
      const { buildSystemPrompt } = require('../system-prompt');
      const systemPrompt = buildSystemPrompt({
        projectContext: this._projectContext || '',
        profile       : this.config.ACTIVE_PROFILE || 'default',
        planMode      : this.config.PLANNING_MODE   || false,
        workingDir    : this.config.WORKING_DIR     || process.cwd(),
      });
      fullText = systemPrompt + '\n\n════════════════════════════════\nUSER TASK:\n' + text;
      this._isFirstMessage = false;
    }

    const input = await this._trySelectors(this._getInputSelectors(), { timeout: 10000 });
    if (!input) {
      throw new Error(
        `Failed to send message to ${this.constructor.name}.\n` +
        `Tried ${this._getInputSelectors().length} input selectors — none found.\n` +
        `The model's UI may have changed. Run: forge-agent --test-model\n` +
        `Or try: forge-agent --calibrate`
      );
    }

    await this._typeText(input, fullText);
    
    // Brief pause to ensure input is registered
    await this.page.waitForTimeout(this.config.SEND_DELAY || 600);

    const clicked = await this._clickElement(this._getSendSelectors(), { timeout: 5000 });
    if (!clicked) {
      // Last resort: press Enter
      await this.page.keyboard.press('Enter');
    }
  }

  /**
   * Wait for AI to finish generating and return response text.
   */
  async waitForResponse() {
    const timeoutMs = this.config.RESPONSE_TIMEOUT || 600_000;
    try {
      const text = await this._waitForTextStable({
        containerSelectors: this._getResponseSelectors(),
        timeoutMs,
      });
      return this._cleanText(text);
    } catch (err) {
      throw new Error(
        `No response received from ${this.constructor.name} after ${timeoutMs / 1000}s.\n` +
        `The AI may still be processing. Try:\n` +
        `  - Increasing timeout: forge-agent --timeout=600 "task"\n` +
        `  - Disabling timeout: forge-agent --no-timeout "task"\n` +
        `  - Testing the model: forge-agent --test-model`
      );
    }
  }

  /**
   * Diagnostic: test if all key selectors are currently finding elements.
   */
  async testSelectors() {
    const results = {
      model: this.constructor.name,
      url: this.getModelUrl(),
      input: false,
      send: false,
      response: false,
      newChat: false,
      errors: [],
    };

    try {
      const input = await this._trySelectors(this._getInputSelectors(), { timeout: 5000 });
      results.input = !!input;
      if (!input) results.errors.push('Input not found: ' + this._getInputSelectors()[0]);
    } catch (e) { results.errors.push('Input error: ' + e.message); }

    try {
      const send = await this._trySelectors(this._getSendSelectors(), { timeout: 3000 });
      results.send = !!send;
      if (!send) results.errors.push('Send button not found');
    } catch (e) { results.errors.push('Send error: ' + e.message); }

    try {
      // Response container may not exist before first message — this is OK
      const resp = await this._trySelectors(this._getResponseSelectors(), { timeout: 2000 });
      results.response = !!resp;
    } catch { results.response = false; }

    try {
      const newChat = await this._trySelectors(this._getNewChatSelectors(), { timeout: 2000 });
      results.newChat = !!newChat;
    } catch { results.newChat = false; }

    results.ready = results.input && results.send;
    return results;
  }

  // ── Protected Helper Methods ───────────────────────────────────────────────

  /**
   * Try multiple selectors in order, dividing timeout between them.
   */
  async _trySelectors(selectors, options = {}) {
    const { timeout = 5000, visible = true } = options;
    const perSelectorTimeout = Math.max(500, Math.floor(timeout / selectors.length));

    for (const selector of selectors) {
      try {
        const el = await this.page.waitForSelector(selector, {
          timeout: perSelectorTimeout,
          state: visible ? 'visible' : 'attached',
        });
        if (el && await el.isVisible()) return el;
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Type text into an element safely, handling contenteditable and large text.
   */
  async _typeText(element, text) {
    if (!element) throw new Error('_typeText: element is null');
    if (!text)    return; // nothing to type

    // Click to focus — but do NOT use the focus as a trigger
    try {
      await element.click({ timeout: 3000 });
    } catch (e) {
      // Element may already be focused — continue
    }

    // Wait a moment for focus to settle
    await this.page.waitForTimeout(300);

    // ATOMIC injection — one operation, no loop, no events that trigger callbacks
    const injected = await this.page.evaluate(({ el, content }) => {
      try {
        // Clear existing content first
        el.focus();

        // Try native React setter first (most reliable for React apps)
        const textareaProto = window.HTMLTextAreaElement.prototype;
        const inputProto    = window.HTMLInputElement.prototype;
        const nativeSetter  =
          Object.getOwnPropertyDescriptor(textareaProto, 'value')?.set ||
          Object.getOwnPropertyDescriptor(inputProto,    'value')?.set;

        if (nativeSetter && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
          // Clear first
          nativeSetter.call(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          // Set new value
          nativeSetter.call(el, content);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return { method: 'native-setter', length: el.value.length };
        }

        // ContentEditable (DeepSeek uses this in some versions)
        if (el.isContentEditable) {
          el.textContent = '';
          el.focus();
          // Use insertText command — most compatible
          const ok = document.execCommand('insertText', false, content);
          if (!ok) {
            // Fallback: direct textContent (loses formatting but works)
            el.textContent = content;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return { method: 'contenteditable', length: el.textContent.length };
        }

        // Generic fallback
        el.value = content;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { method: 'direct-assign', length: el.value.length };

      } catch (err) {
        return { method: 'error', error: err.message, length: 0 };
      }
    }, { el: element, content: text });

    if (!injected || injected.length === 0) {
      // Injection failed — try keyboard as last resort
      // This is SLOW but reliable
      await element.fill(''); // clear
      await this.page.waitForTimeout(100);
      // Type in one big chunk — no character delay
      await element.type(text, { delay: 0 });
    }

    // CRITICAL: Wait after injection for React to process the state change
    await this.page.waitForTimeout(500);
  }

  /**
   * Click an element using multiple fallback selectors.
   */
  async _clickElement(selectors, options = {}) {
    const { timeout = 10000, force = false } = options;
    const el = await this._trySelectors(selectors, { timeout });
    if (!el) return null;
    
    try {
      await el.click({ force, timeout: 2000 });
      return el;
    } catch {
      // Fallback: JS click
      try {
        await el.evaluate(e => e.click());
        return el;
      } catch {
        return null;
      }
    }
  }

  /**
   * Wait for response container text to stop changing.
   */
  async _waitForTextStable(options = {}) {
    const {
      containerSelectors,
      stableMs = this.config.STABLE_DELAY || 1500,
      timeoutMs = this.config.RESPONSE_TIMEOUT || 600_000,
      pollMs = this.config.GENERATION_POLL || 400,
    } = options;

    const start = Date.now();
    let lastText = '';
    let stableStart = null;

    while (Date.now() - start < timeoutMs) {
      const text = await this._extractText(containerSelectors);

      if (text !== lastText) {
        lastText = text;
        stableStart = Date.now();
      } else if (stableStart && Date.now() - stableStart >= stableMs) {
        if (text.trim().length > 0) {
          // If still generating (stop button present), don't finish yet
          if (!await this._isGenerating()) return text;
          stableStart = Date.now(); // Reset and wait more
        }
      }

      await this.page.waitForTimeout(pollMs);
    }

    throw new Error(`Response timeout after ${timeoutMs}ms`);
  }

  /**
   * Extract text from the last element matching any of the selectors.
   */
  async _extractText(selectors) {
    for (const selector of selectors) {
      try {
        const elements = await this.page.$$(selector);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          const text = await last.innerText();
          if (text && text.trim().length > 5) return text.trim();
        }
      } catch {
        continue;
      }
    }
    return '';
  }

  /**
   * Check if AI is still generating by looking for stop buttons.
   */
  async _isGenerating() {
    const stopSelectors = this._getStopSelectors();
    for (const sel of stopSelectors) {
      try {
        const el = await this.page.$(sel);
        if (el && await el.isVisible()) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Clean AI response text from artifacts.
   */
  _cleanText(text) {
    if (!text) return '';
    return text
      // Strip thinking blocks
      .replace(/<think>[\s\S]*?<\/think>\n?/gi, '')
      // Strip "Thinking..." headers
      .replace(/^Thinking\.{0,3}\n[\s\S]*?\n\n/m, '')
      // Strip model prefixes
      .replace(/^(Assistant|AI|Claude|GPT|Gemini|DeepSeek):\s*/i, '')
      // Strip copy-code button artifacts
      .replace(/^\d+(?:Copy|Run|Insert|Edit)\w*.*$/gm, '')
      .replace(/Copy code[\s\S]{0,50}$/gm, '')
      // Strip page indicators
      .replace(/\d+ \/ \d+[\s\n]*$/g, '')
      // Collapse 3+ blank lines into 2
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

module.exports = BaseAdapter;
