// src/parser.js — Parse DeepSeek's text responses to extract tool calls
'use strict';

/**
 * Parse a DeepSeek/ChatGPT/Gemini response into a structured result.
 *
 * Return shapes:
 *   { type: 'tool_call', name: string, args: object, rawText: string }
 *   { type: 'final',     content: string }
 *   { type: 'error',     message: string }
 *   { type: 'empty' }
 */
function parseResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return { type: 'empty' };

  const text = rawText.trim();
  if (!text) return { type: 'empty' };

  // ── Strategy 1: <tool_call> XML tags ─────────────────────────────────────
  // Matches:  <tool_call>{"tool":"...", "args":{...}}</tool_call>
  // Also:     text before it is fine — we just extract the tag content
  const xmlMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (xmlMatch) {
    const result = _parseToolJSON(xmlMatch[1], text);
    if (result) return result;
  }

  // ── Strategy 2: backtick code block tagged tool_call or json ─────────────
  // Matches:  ```tool_call\n{...}\n```  or  ```json\n{...}\n```
  // This is what DeepSeek uses when it sees the "HOW TO CALL TOOLS" prompt
  // from prompt.js — it uses "name" key instead of "tool" key
  const codeBlockRe = /```(?:tool_call|json)?\s*\n?([\s\S]*?)\n?\s*```/gi;
  let cbMatch;
  while ((cbMatch = codeBlockRe.exec(text)) !== null) {
    const result = _parseToolJSON(cbMatch[1].trim(), text);
    if (result) return result;
  }

  // ── Strategy 3: TASK_COMPLETE ─────────────────────────────────────────────
  if (_containsTaskComplete(text)) {
    return { type: 'final', content: text };
  }

  // ── Strategy 4: bare JSON object anywhere in text ─────────────────────────
  // Walk through text looking for { ... } blocks
  const bareResult = _extractBareJSON(text);
  if (bareResult) return bareResult;

  // ── Strategy 5: plain text / conversational response ─────────────────────
  return { type: 'final', content: text };
}

// ─────────────────────────────────────────────
//  Core JSON parser — handles both "tool" and "name" key styles
//  and attempts repair of broken JSON (unescaped quotes in strings)
// ─────────────────────────────────────────────

function _parseToolJSON(jsonStr, rawText) {
  if (!jsonStr || typeof jsonStr !== 'string') return null;

  const clean = jsonStr.trim();
  if (!clean || clean[0] !== '{') return null;

  // Attempt 1: standard JSON.parse
  let parsed = _tryJSONParse(clean);

  // Attempt 2: repair common issues
  if (!parsed) parsed = _tryJSONParse(_repairJSON(clean));

  // Attempt 3: extract tool name and args with regex (handles broken content strings)
  if (!parsed) return _regexExtractToolCall(clean, rawText);

  // Must have a tool name under "tool" or "name" key
  const toolName = parsed.tool || parsed.name || parsed.function;
  if (!toolName || typeof toolName !== 'string') return null;

  // Args under "args", "arguments", "parameters", "input", "params"
  // If none found, remove the name keys and use the rest as args
  let args = parsed.args
    || parsed.arguments
    || parsed.parameters
    || parsed.input
    || parsed.params
    || null;

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    // Build args from remaining keys (excluding tool/name identifiers)
    args = { ...parsed };
    delete args.tool;
    delete args.name;
    delete args.function;
    delete args.args;
    delete args.arguments;
    delete args.parameters;
    delete args.input;
    delete args.params;
  }

  return {
    type: 'tool_call',
    name: toolName.trim(),
    args: args || {},
    rawText: rawText,
  };
}

function _tryJSONParse(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}

function _repairJSON(str) {
  return str
    .replace(/,(\s*[}\]])/g, '$1')           // trailing commas
    .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":') // unquoted keys
    .replace(/:\s*'([^']*)'/g, ':"$1"');     // single-quoted values
}

/**
 * Last-resort extraction using regex when JSON.parse fails completely.
 * Handles the common case where file content contains unescaped quotes,
 * e.g. write_file with HTML that has lang="en" inside the content string.
 */
function _regexExtractToolCall(str, rawText) {
  // Extract tool/name
  const nameMatch = str.match(/"(?:tool|name|function)"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;

  const toolName = nameMatch[1].trim();
  if (!toolName) return null;

  // Extract args object — everything after "args": { ... }
  // For write_file the content value may have broken quotes — handle specially
  const argsMatch = str.match(/"args"\s*:\s*(\{[\s\S]*)/);
  if (!argsMatch) {
    // No args key — tool takes no arguments or we cannot parse them
    return {
      type: 'tool_call',
      name: toolName,
      args: {},
      rawText: rawText,
    };
  }

  // Try to parse just the args portion
  let argsStr = argsMatch[1];

  // Remove trailing content after last } (closing of args object)
  // Walk to find balanced closing brace
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }

  if (end !== -1) argsStr = argsStr.slice(0, end + 1);

  let args = _tryJSONParse(argsStr) || _tryJSONParse(_repairJSON(argsStr));

  if (!args) {
    // Extract individual simple string args with regex
    args = {};
    const simpleKV = /"\s*([^"]+)\s*"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = simpleKV.exec(argsStr)) !== null) {
      args[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    }
  }

  // Special case: write_file / append_to_file — always extract content fully
  if ((toolName === 'write_file' || toolName === 'append_to_file') && args) {
    const pathM = argsStr.match(/"path"\s*:\s*"([^"]+)"/);
    if (pathM) args.path = pathM[1];

    // Extract everything from the start of the content string
    const contentMatch = argsStr.match(/"content"\s*:\s*"([\s\S]*)/);
    if (contentMatch) {
      let raw = contentMatch[1];

      // Remove the closing JSON structure from the very end of the string
      // This matches the trailing quote and any closing braces:  "} or "\n  }\n}
      const closingMatch = raw.match(/"\s*\}?\s*\}?\s*$/);
      if (closingMatch) {
        raw = raw.slice(0, -closingMatch[0].length);
      } else if (raw.endsWith('"')) {
        // If it was abruptly truncated by the LLM token limit
        raw = raw.slice(0, -1);
      }

      // Unescape standard escape sequences
      raw = raw
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      args.content = raw;
    }
  }

  return {
    type: 'tool_call',
    name: toolName,
    args: args || {},
    rawText: rawText,
  };
}

function _extractBareJSON(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const result = _parseToolJSON(text.slice(i, j + 1), text);
          if (result) return result;
          break;
        }
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

function _containsTaskComplete(text) {
  return /(?:^|\n)\s*TASK_COMPLETE\s*(?:\n|$)/m.test(text)
    || text.trim().endsWith('TASK_COMPLETE')
    || text.trim() === 'TASK_COMPLETE';
}

function containsTaskComplete(text) { return _containsTaskComplete(text); }

function hasToolCall(text) {
  if (!text) return false;
  return /<tool_call>/i.test(text)
    || /```(?:tool_call|json)/i.test(text)
    || /\{[\s\S]*"(?:tool|name)"\s*:/i.test(text);
}

function extractLeadingText(text) {
  if (!text) return '';
  const tag = text.indexOf('<tool_call>');
  if (tag > 0) return text.slice(0, tag).trim();
  const tick = text.indexOf('```');
  if (tick > 0) return text.slice(0, tick).trim();
  const json = text.search(/\{[\s\S]*"(?:tool|name)"\s*:/i);
  if (json > 0) return text.slice(0, json).trim();
  return '';
}

module.exports = {
  parseResponse,
  hasToolCall,
  containsTaskComplete,
  extractLeadingText,
  tryParseToolJSON: _parseToolJSON,
};