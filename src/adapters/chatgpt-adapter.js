// src/adapters/chatgpt-adapter.js — ChatGPT model adapter
'use strict';

const BaseAdapter = require('./base-adapter');
const logger      = require('../logger');

/**
 * Adapter for chatgpt.com
 */
class ChatGPTAdapter extends BaseAdapter {
  constructor(page, config) {
    super(page, config);
  }

  // ── Implement Abstract Methods ─────────────────────────────────────────────

  _getInputSelectors() {
    return [
      '#prompt-textarea',                          // Primary: stable ID
      'div#prompt-textarea',
      '[data-id="prompt-textarea"]',
      'div[contenteditable="true"][data-virtualkeyboard-disabled]',
      'div[contenteditable="true"][tabindex="0"]',
      'div[contenteditable="true"]',
      'textarea[data-id="root"]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="message" i]',
      'textarea',
    ];
  }

  _getSendSelectors() {
    return [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message" i]',
      'button[aria-label="send message" i]',
      'button[aria-label="Send" i]',
      '#send-button',
      'button:has(svg)[aria-disabled="false"]',
      'button[class*="send"]:not([disabled])',
      'form button[type="submit"]',
    ];
  }

  _getStopSelectors() {
    return [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating" i]',
      'button[aria-label="stop generating" i]',
      'button:has(svg.stop-icon)',
      '[class*="stop"]:not([disabled])',
    ];
  }

  _getNewChatSelectors() {
    return [
      'a[href="/"]',
      'button[aria-label="New chat" i]',
      '[data-testid="new-chat-button"]',
      'nav a[href="/"]',
      'button:has-text("New chat")',
      '.new-conversation-button',
    ];
  }

  _getResponseSelectors() {
    return [
      '[data-message-author-role="assistant"]:last-child .markdown',
      '[data-message-author-role="assistant"]:last-child',
      '.message:last-child .markdown',
      'article:last-child .markdown',
      '[class*="agent-turn"]:last-child',
      '.prose:last-child',
      '#__next div[class*="markdown"]:last-child',
    ];
  }

  getModelUrl() {
    return 'https://chatgpt.com';
  }

  // ── Overrides ──────────────────────────────────────────────────────────────

  async isReady() {
    // Proactively check for and dismiss modals/overlays
    const overlaySelectors = [
      '[data-radix-dialog-overlay]',
      '.modal-overlay',
      '[role="dialog"]',
      'button:has-text("Stay logged out")',
      'button:has-text("Dismiss")',
    ];

    for (const sel of overlaySelectors) {
      try {
        const el = await this.page.$(sel);
        if (el && await el.isVisible()) {
          if (sel.includes('button')) {
            await el.click();
          } else {
            await this.page.keyboard.press('Escape');
          }
          await this.page.waitForTimeout(500);
        }
      } catch {}
    }

    return await super.isReady();
  }
}

module.exports = ChatGPTAdapter;
