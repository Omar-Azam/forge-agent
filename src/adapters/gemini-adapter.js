// src/adapters/gemini-adapter.js — Gemini model adapter
'use strict';

const BaseAdapter = require('./base-adapter');
const logger      = require('../logger');

/**
 * Adapter for gemini.google.com
 */
class GeminiAdapter extends BaseAdapter {
  constructor(page, config) {
    super(page, config);
  }

  // ── Implement Abstract Methods ─────────────────────────────────────────────

  _getInputSelectors() {
    return [
      'rich-textarea .ql-editor',           // Quill editor inside rich-textarea
      'rich-textarea div[contenteditable]',  // contenteditable inside component
      '.ql-editor[contenteditable="true"]',  // Direct Quill editor
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"]',
      'textarea[aria-label*="Enter a prompt" i]',
      'textarea[placeholder*="Enter a prompt" i]',
      'textarea[aria-label*="prompt" i]',
      '[jsname="YPqjbf"]',                  // Common Gemini jsname
      'textarea',
    ];
  }

  _getSendSelectors() {
    return [
      'button[aria-label*="Send message" i]',
      'button[aria-label*="send message" i]',
      'button[jsname*="send" i]',
      '[data-test-id="send-button"]',
      'button.send-button',
      'button[aria-label="Send" i]',
      'button[mattooltip*="Send" i]',
      'button:has(mat-icon):not([disabled])',
      '.send-message-button',
    ];
  }

  _getStopSelectors() {
    return [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="stop" i]',
      'button[jsname*="stop" i]',
      '.stop-button',
      'button:has(mat-icon[data-mat-icon-name="stop"])',
    ];
  }

  _getNewChatSelectors() {
    return [
      'a[href="/app"]',
      'button[aria-label*="New chat" i]',
      'button[aria-label*="new chat" i]',
      '[data-test-id="new-conversation-button"]',
      'c-wiz a[href="/app"]',
      '.new-conversation-button',
      'a[jsname*="new" i]',
      'button[mattooltip*="New chat" i]',
    ];
  }

  _getResponseSelectors() {
    return [
      'model-response:last-child .markdown',
      'model-response:last-child',
      '.response-container:last-child .markdown-content',
      'message-content:last-child',
      '[data-response-index]:last-child',
      '.conversation-container .model-response:last-child',
      'div.model-response:last-child p',
    ];
  }

  getModelUrl() {
    return 'https://gemini.google.com/app';
  }

  // ── Overrides ──────────────────────────────────────────────────────────────

  async newChat() {
    this._isFirstMessage = true;
    try {
      await this.page.goto(this.getModelUrl(), {
        waitUntil: 'domcontentloaded',
        timeout: this.config.BROWSER_TIMEOUT || 30_000,
      });
      await this.page.waitForTimeout(2000);
    } catch (err) {
      logger.warn(`Gemini navigation failed: ${err.message}. Trying selector fallback.`);
      // Fallback: click new chat button
      await this._clickElement(this._getNewChatSelectors(), { timeout: 10000 });
      await this.page.waitForTimeout(2000);
    }
  }
}

module.exports = GeminiAdapter;
