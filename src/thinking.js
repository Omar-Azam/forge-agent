// src/thinking.js — R1 thinking mode utilities
'use strict';

/**
 * Returns true if text contains <think> blocks.
 */
function detectThinkingMode(text) {
  if (!text) return false;
  return /<think>[\s\S]*?<\/think>/i.test(text) || /<think>[\s\S]*$/i.test(text);
}

/**
 * Extracts thinking content and the actual response.
 * @returns {Object} { thinking: string|null, response: string }
 */
function extractThinking(text) {
  if (!text) return { thinking: null, response: '' };

  const match = text.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/i);
  if (match) {
    return {
      thinking: match[1].trim(),
      response: match[2].trim()
    };
  }

  // Handle mid-thought
  const midMatch = text.match(/<think>([\s\S]*)$/i);
  if (midMatch) {
    return {
      thinking: midMatch[1].trim(),
      response: ''
    };
  }

  return { thinking: null, response: text.trim() };
}

/**
 * Returns true if text contains an opening <think> but no closing </think>.
 */
function isStillThinking(text) {
  if (!text) return false;
  const openCount = (text.match(/<think>/gi) || []).length;
  const closeCount = (text.match(/<\/think>/gi) || []).length;
  return openCount > closeCount;
}

/**
 * Returns a short summary of the thinking block.
 */
function summariseThinking(thinkingText, maxLines = 5) {
  if (!thinkingText) return '';
  const lines = thinkingText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, maxLines);
  
  return lines.map(l => `  💭 ${l}`).join('\n');
}

/**
 * Removes ALL <think>...</think> blocks.
 */
function stripAllThinkingBlocks(text) {
  if (!text) return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>\n?/gi, '')
    .trim();
}

/**
 * Formats thinking for --debug output.
 */
function formatThinkingForLog(thinkingText) {
  if (!thinkingText) return '';
  const lines = thinkingText.split('\n');
  const displayLines = lines.slice(0, 20);
  const truncatedCount = lines.length - 20;

  let output = '┌─ Thinking Block ──────────────────────────────────\n';
  displayLines.forEach(l => {
    output += `│ ${l.slice(0, 75)}\n`;
  });
  if (truncatedCount > 0) {
    output += `│ ... (${truncatedCount} more lines)\n`;
  }
  output += '└───────────────────────────────────────────────────';
  return output;
}

/**
 * Tracks thinking state across multiple updates.
 */
class ThinkingTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this._hasThinking = false;
    this._isThinking = false;
    this._thinkingContent = '';
    this._responseContent = '';
  }

  update(rawText) {
    if (!rawText) return;

    if (detectThinkingMode(rawText)) {
      this._hasThinking = true;
    }

    this._isThinking = isStillThinking(rawText);
    const { thinking, response } = extractThinking(rawText);
    this._thinkingContent = thinking || '';
    this._responseContent = response || '';
  }

  get isThinking() { return this._isThinking; }
  get hasThinking() { return this._hasThinking; }
  get thinkingContent() { return this._thinkingContent; }
  get responseContent() { return this._responseContent; }
}

module.exports = {
  detectThinkingMode,
  extractThinking,
  isStillThinking,
  summariseThinking,
  stripAllThinkingBlocks,
  formatThinkingForLog,
  ThinkingTracker
};
