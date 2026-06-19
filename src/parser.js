// src/parser.js — Parse DeepSeek's text responses to extract tool calls
'use strict';

/**
 * Parse a DeepSeek/ChatGPT/Gemini response into a structured result.
 *
 * Return shapes:
 *   { type: 'tool_call', name: string, args: object, rawText: string }
 *   { type: 'task_complete' }
 *   { type: 'text', content: string }
 *   { type: 'final', content: string }   // kept for backward compat
 *   { type: 'error', message: string }
 *   { type: 'empty' }
 */
function parseResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return { type: 'empty' };

  const text = rawText.trim();
  if (!text) return { type: 'empty' };

  // ── Strategy 1: <tool_call> XML tags ─────────────────────────────────────
  const xmlMatch = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (xmlMatch) {
    const result = _parseToolJSON(xmlMatch[1], text);
    if (result) return result;
  }

  // ── Strategy 2: backtick code block tagged tool_call or json ─────────────
  const codeBlockRe = /```(?:tool_call|json)?\s*\n?([\s\S]*?)\n?\s*```/gi;
  let cbMatch;
  while ((cbMatch = codeBlockRe.exec(text)) !== null) {
    const result = _parseToolJSON(cbMatch[1].trim(), text);
    if (result) return result;
  }

  // ── Strategy 3: function‑call style: tool_name("arg") or tool_name(key="value", ...)
  const funcMatch = text.match(
    /^\s*([a-zA-Z_][\w]*)\s*\(\s*((?:["'][^"']*["']|[^)])*?)\s*\)\s*$/s
  );
  if (funcMatch) {
    const toolName = funcMatch[1];
    const argsStr = funcMatch[2].trim();
    const args = _parseFunctionArgs(argsStr);
    if (args !== null) {
      return { type: 'tool_call', name: toolName, args, rawText: text };
    }
  }

  // ── Strategy 4: TASK_COMPLETE ─────────────────────────────────────────────
  if (_containsTaskComplete(text)) {
    return { type: 'task_complete' };
  }

  // ── Strategy 5: bare JSON object anywhere in text ─────────────────────────
  const bareResult = _extractBareJSON(text);
  if (bareResult) return bareResult;

  // ── Strategy 6: plain text / conversational response ─────────────────────
  return { type: 'text', content: text };
}

// ─────────────────────────────────────────────
//  Core JSON parser — handles both "tool" and "name" key styles
//  and attempts repair of broken JSON
// ─────────────────────────────────────────────

function _parseToolJSON(jsonStr, rawText) {
  if (!jsonStr || typeof jsonStr !== 'string') return null;

  const clean = jsonStr.trim();
  if (!clean || clean[0] !== '{') return null;

  let parsed = _tryJSONParse(clean);
  if (!parsed) parsed = _tryJSONParse(_repairJSON(clean));
  if (!parsed) return _regexExtractToolCall(clean, rawText);

  const toolName = parsed.tool || parsed.name || parsed.function;
  if (!toolName || typeof toolName !== 'string') return null;

  let args = parsed.args
    || parsed.arguments
    || parsed.parameters
    || parsed.input
    || parsed.params
    || null;

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
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
    type   : 'tool_call',
    name   : toolName.trim(),
    args   : args || {},
    rawText: rawText,
  };
}

function _tryJSONParse(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}

function _repairJSON(str) {
  return str
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":')
    .replace(/:\s*'([^']*)'/g, ':"$1"');
}

/**
 * Last‑resort extraction when JSON.parse fails (e.g., huge unescaped content).
 * Keeps the robust write_file / append_to_file content extraction.
 */
function _regexExtractToolCall(str, rawText) {
  const nameMatch = str.match(/"(?:tool|name|function)"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;

  const toolName = nameMatch[1].trim();
  if (!toolName) return null;

  const argsMatch = str.match(/"args"\s*:\s*(\{[\s\S]*)/);
  if (!argsMatch) {
    return {
      type   : 'tool_call',
      name   : toolName,
      args   : {},
      rawText: rawText,
    };
  }

  let argsStr = argsMatch[1];

  // Find balanced closing brace
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (esc)          { esc = false; continue; }
    if (ch === '\\')  { esc = true;  continue; }
    if (ch === '"')   { inStr = !inStr; continue; }
    if (inStr)        continue;
    if (ch === '{')   depth++;
    if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }

  if (end !== -1) argsStr = argsStr.slice(0, end + 1);

  let args = _tryJSONParse(argsStr) || _tryJSONParse(_repairJSON(argsStr));

  if (!args) {
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

    const contentMatch = argsStr.match(/"content"\s*:\s*"([\s\S]*)/);
    if (contentMatch) {
      let raw = contentMatch[1];
      
      const closingMatch = raw.match(/"\s*\}?\s*\}?\s*$/);
      if (closingMatch) {
        raw = raw.slice(0, -closingMatch[0].length);
      } else if (raw.endsWith('"')) {
        raw = raw.slice(0, -1);
      }

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
    type   : 'tool_call',
    name   : toolName,
    args   : args || {},
    rawText: rawText,
  };
}

/**
 * Parses function‑call arguments like `"path/to/file"` or `key="value", count=3`.
 */
function _parseFunctionArgs(argsStr) {
  if (!argsStr) return {};
  const args = {};
  const pairRe = /([a-zA-Z_]\w*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  const singleRe = /^"([^"]*)"$|^'([^']*)'$/;

  let remainder = argsStr;
  let match;

  // First try key=value pairs
  while ((match = pairRe.exec(argsStr)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4];
    args[key] = val;
    remainder = remainder.replace(match[0], '').replace(/^,?\s*/, '');
  }

  // If nothing captured but there is content, treat it as a single "path" argument
  if (Object.keys(args).length === 0 && argsStr.trim().length > 0) {
    const single = singleRe.exec(argsStr.trim());
    if (single) {
      args.path = single[1] || single[2];
    } else {
      // Fallback: treat the whole thing as a path if it looks like a filename
      if (/^[\w./-]+$/.test(argsStr.trim())) {
        args.path = argsStr.trim();
      } else {
        return null; // unrecognised
      }
    }
  }

  return args;
}

function _extractBareJSON(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (esc)         { esc = false; continue; }
      if (ch === '\\') { esc = true;  continue; }
      if (ch === '"')  { inStr = !inStr; continue; }
      if (inStr)       continue;
      if (ch === '{')  depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const result = _parseToolJSON(text.slice(i, j + 1), text);
          if (result) return result;
          // If it's JSON but not a tool call, return it as text
          return { type: 'text', content: text };
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
    || /\{[\s\S]*"(?:tool|name)"\s*:/i.test(text)
    || /^\s*[a-zA-Z_]\w*\s*\(/.test(text);  // function call style
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