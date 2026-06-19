// src/formatter.js — Output formatting system for Forge Agent
'use strict';

const path = require('path');
const fs = require('fs');

const SUPPORTED_FORMATS = ['text', 'markdown', 'json', 'json-raw', 'minimal', 'silent'];

/**
 * Main formatting entry point.
 */
function format(content, formatName, opts = {}) {
  const f = formatName || 'text';
  
  try {
    switch (f) {
      case 'markdown': return formatMarkdown(content, opts);
      case 'json':     return formatJson(content, opts);
      case 'json-raw': return formatJsonRaw(content, opts);
      case 'minimal':  return formatMinimal(content);
      case 'silent':   return formatSilent();
      case 'text':
      default:         return formatText(content);
    }
  } catch (err) {
    // If anything really goes wrong, try the simplest string conversion
    try {
      return String(content || '').trim();
    } catch {
      return '';
    }
  }
}

function formatText(content) {
  return String(content || '').trim();
}

function formatMarkdown(content, opts = {}) {
  let text = String(content || '').trim();
  if (!text || text === '[object Object]') return '';

  const hasHeaders = /^#+\s/m.test(text);
  const hasFences = /```/.test(text);

  // If it's plain prose, wrap it
  if (!hasHeaders && !hasFences) {
    const taskLine = opts.task ? `> **Task:** ${opts.task.slice(0, 100)}${opts.task.length > 100 ? '...' : ''}\n\n` : '';
    return `# Task Result\n\n${taskLine}${text}`;
  }

  // Normalise code blocks: 4-space indent to fences if it looks like code
  // and ensure fences have language hints if possible
  text = text.replace(/^ {4,}(.+)$/gm, (match, code) => {
    // Simple heuristic: if line looks like code (ends with ; { } or is a common keyword)
    if (/[;{}]$|^\s*(const|let|var|function|def|import|if|for|class)\s/i.test(code)) {
      return '```\n' + code + '\n```';
    }
    return match;
  });

  return text;
}

function formatJson(content, opts = {}) {
  const envelope = {
    forge_agent: {
      version: '1.3.0',
      status: 'completed',
      output: content
    }
  };

  if (opts.timestamp) envelope.forge_agent.timestamp = new Date().toISOString();
  if (opts.task)      envelope.forge_agent.task = opts.task;
  if (opts.model)     envelope.forge_agent.model = opts.model;
  if (opts.profile)   envelope.forge_agent.profile = opts.profile;

  return JSON.stringify(envelope, null, 2);
}

function formatJsonRaw(content, opts = {}) {
  const text = String(content || '').trim();
  if (!text || text === '[object Object]') return formatJson(content, opts);

  // Strategy 1: Valid JSON as-is
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {}

  // Strategy 2: Extract from markdown blocks
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      return JSON.stringify(parsed, null, 2);
    } catch {}
  }

  // Strategy 3: Find first {/[ and last }/]
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

  if (start !== -1) {
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const end = (lastBrace > lastBracket) ? lastBrace : lastBracket;

    if (end !== -1 && end > start) {
      try {
        const potential = text.substring(start, end + 1);
        const parsed = JSON.parse(potential);
        return JSON.stringify(parsed, null, 2);
      } catch {}
    }
  }

  // Strategy 4: Fallback to envelope
  return formatJson(content, opts);
}

function formatMinimal(content) {
  let text = String(content || '').trim();
  if (!text || text === '[object Object]') return '';

  // Remove markdown headers
  text = text.replace(/^#+\s+/gm, '');
  
  // Remove horizontal rules
  text = text.replace(/^[*-]{3,}$/gm, '');

  // Remove bold/italic markers
  text = text.replace(/(\*\*|__|[*_])(.*?)\1/g, '$2');

  // Remove emojis at start of lines
  text = text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/gu, '');

  // Normalise blank lines (max 1)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function formatSilent() {
  return '';
}

function detectBestFormat(content) {
  const text = String(content || '').trim();
  if (!text || text === '[object Object]') return 'text';

  if (text.startsWith('{') || text.startsWith('[')) return 'json-raw';
  
  if (/^#+\s/m.test(text) || /```/.test(text)) return 'markdown';

  return 'text';
}

module.exports = {
  format,
  detectBestFormat,
  SUPPORTED_FORMATS
};
