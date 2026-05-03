// src/parser.js — Parse DeepSeek's text responses to extract tool calls
'use strict';

/**
 * Parse a raw DeepSeek response string.
 *
 * Returns one of:
 *   { type: 'tool_call', name: string, args: object, raw: string }
 *   { type: 'final',     content: string,            raw: string }
 *   { type: 'error',     message: string,            raw: string }
 */
function parseResponse(rawText) {
  const text = stripThinkingBlocks(rawText).trim();

  // ── Strategy 0 (DOM FALLBACK): bare "tool_call\n{ ... }" ─────────────────
  //
  //  When the browser markdown renderer converts:
  //    ```tool_call
  //    { "name": "write_file", "args": {...} }
  //    ```
  //  …into a <pre><code class="language-tool_call"> element, our getFullText()
  //  now reconstructs the fence.  BUT if that still fails for any reason, this
  //  strategy catches the raw DOM text which looks like:
  //
  //    tool_call
  //    {
  //      "name": "write_file",
  //      "args": { ... }
  //    }
  //
  const bareMatch = text.match(/^tool_call\s*\n([\s\S]+)$/i);
  if (bareMatch) {
    const jsonRaw = bareMatch[1].trim();
    try {
      const parsed = JSON.parse(jsonRaw);
      const name   = parsed.name || parsed.tool || parsed.function;
      const args   = parsed.args || parsed.arguments || parsed.parameters || parsed.input || {};
      if (name && typeof name === 'string') {
        return { type: 'tool_call', name, args, raw: rawText };
      }
    } catch {
      const fixed = attemptJsonFix(jsonRaw);
      if (fixed) {
        const name = fixed.name || fixed.tool || fixed.function;
        const args = fixed.args || fixed.arguments || fixed.parameters || fixed.input || {};
        if (name) return { type: 'tool_call', name, args, raw: rawText };
      }
    }
  }

  // ── Strategy 1 (PRIMARY): ```tool_call fenced code block ─────────────────
  //  Our primary format — reconstructed by getFullText() from <pre><code>.
  const fencedMatch = text.match(/```tool_call\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const raw = fencedMatch[1].trim();
    try {
      const parsed = JSON.parse(raw);
      const name   = parsed.name || parsed.tool || parsed.function;
      const args   = parsed.args || parsed.arguments || parsed.parameters || parsed.input || {};
      if (name && typeof name === 'string') {
        return { type: 'tool_call', name, args, raw: rawText };
      }
    } catch (e) {
      const fixed = attemptJsonFix(raw);
      if (fixed) {
        const name = fixed.name || fixed.tool || fixed.function;
        const args = fixed.args || fixed.arguments || fixed.parameters || fixed.input || {};
        if (name) return { type: 'tool_call', name, args, raw: rawText };
      }
      return {
        type    : 'error',
        message : 'tool_call block had invalid JSON: ' + e.message + '\nContent: ' + raw.slice(0, 300),
        raw     : rawText,
      };
    }
  }

  // ── Strategy 2: ```json block with "name"/"tool" key ──────────────────────
  const jsonFenceMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonFenceMatch) {
    try {
      const parsed = JSON.parse(jsonFenceMatch[1]);
      const name   = parsed.name || parsed.tool || parsed.function;
      const args   = parsed.args || parsed.arguments || parsed.parameters || parsed.input || {};
      if (name && typeof name === 'string') {
        return { type: 'tool_call', name, args, raw: rawText };
      }
    } catch {}
  }

  // ── Strategy 3: XML <tool_call> ───────────────────────────────────────────
  const xmlMatch = text.match(
    /<tool_call[^>]*>\s*(?:<name>([\s\S]*?)<\/name>\s*)?(?:<input>([\s\S]*?)<\/input>|<args>([\s\S]*?)<\/args>)\s*<\/tool_call>/i
  );
  if (xmlMatch) {
    const name     = (xmlMatch[1] || '').trim();
    const inputRaw = stripCodeFences((xmlMatch[2] || xmlMatch[3] || '').trim());
    if (name) return tryParseToolCall(name, inputRaw, rawText);
  }

  // ── Strategy 4: XML with angle-brackets stripped by DOM ───────────────────
  const domStrippedMatch = text.match(
    /tool_call\s+name\s+([\w_]+)\s*\/name\s+input\s*([\s\S]*?)\s*\/input\s*\/tool_call/i
  );
  if (domStrippedMatch) {
    const name     = domStrippedMatch[1].trim();
    const inputRaw = stripCodeFences(domStrippedMatch[2].trim());
    return tryParseToolCall(name, inputRaw, rawText);
  }

  // ── Strategy 5: Any JSON object with "name" key anywhere in text ──────────
  //  Uses a greedy match to find the outermost JSON object (not fragments).
  if (/["'](?:name|tool|function)["']\s*:\s*["'][\w_]+["']/.test(text)) {
    const jsonObj = extractLargestJsonObject(text);
    if (jsonObj) {
      const name = jsonObj.name || jsonObj.tool || jsonObj.function;
      const args = jsonObj.args || jsonObj.arguments || jsonObj.parameters || jsonObj.input || {};
      if (name && typeof name === 'string') {
        return { type: 'tool_call', name, args, raw: rawText };
      }
    }
  }

  // ── Strategy 6: Python-style function call in code block ──────────────────
  const funcMatch = text.match(/```\w*\s*([\w_]+)\(([^)]*)\)\s*```/);
  if (funcMatch) {
    const name    = funcMatch[1];
    const argsRaw = funcMatch[2];
    const args    = {};
    const argRe   = /(\w+)\s*=\s*(?:"([^"]*?)"|'([^']*?)'|(\d+(?:\.\d+)?)|(\btrue\b|\bfalse\b))/g;
    let   m;
    while ((m = argRe.exec(argsRaw)) !== null) {
      const key = m[1];
      if      (m[2] !== undefined) args[key] = m[2];
      else if (m[3] !== undefined) args[key] = m[3];
      else if (m[4] !== undefined) args[key] = parseFloat(m[4]);
      else if (m[5] !== undefined) args[key] = m[5] === 'true';
    }
    if (Object.keys(args).length > 0) {
      return { type: 'tool_call', name, args, raw: rawText };
    }
  }

  // ── No tool call detected — final prose response ───────────────────────────
  return { type: 'final', content: text, raw: rawText };
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function tryParseToolCall(name, inputRaw, rawText) {
  try {
    const args = JSON.parse(inputRaw);
    return { type: 'tool_call', name, args, raw: rawText };
  } catch (e) {
    // Try to fix common JSON issues
    const fixed = attemptJsonFix(inputRaw);
    if (fixed !== null) {
      return { type: 'tool_call', name, args: fixed, raw: rawText };
    }
    return {
      type    : 'error',
      message : `Tool "${name}" returned invalid JSON: ${e.message}\nRaw input: ${inputRaw.slice(0, 200)}`,
      raw     : rawText,
    };
  }
}

/** Strip ```json ... ``` or ``` ... ``` fences */
function stripCodeFences(str) {
  return str
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** Remove DeepSeek R1 thinking blocks */
function stripThinkingBlocks(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>\n?/gi, '')
    .replace(/^Thinking\.{0,3}\n[\s\S]*?\n\n/m, '')
    .trim();
}

/** Attempt to fix common LLM JSON mistakes */
function attemptJsonFix(str) {
  try {
    const fixed = str
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/**
 * Extract the largest valid JSON object from a string.
 * Uses a bracket-counting approach rather than regex to handle nested objects.
 */
function extractLargestJsonObject(text) {
  let best = null;
  let bestLen = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth   = 0;
    let inStr   = false;
    let escape  = false;

    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (escape)          { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"')      { inStr = !inStr; continue; }
      if (inStr)           { continue; }
      if (ch === '{')      { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          if (candidate.length > bestLen) {
            try {
              const parsed = JSON.parse(candidate);
              best    = parsed;
              bestLen = candidate.length;
            } catch {
              const fixed = attemptJsonFix(candidate);
              if (fixed && candidate.length > bestLen) {
                best    = fixed;
                bestLen = candidate.length;
              }
            }
          }
          break;
        }
      }
    }
  }

  return best;
}

/** Format a tool result for sending back to the AI */
function formatToolResult(toolName, result, isError = false) {
  const status = isError ? 'ERROR' : 'SUCCESS';
  return [
    `[TOOL RESULT: ${toolName} | ${status}]`,
    String(result),
    `[END TOOL RESULT]`,
  ].join('\n');
}

/** Check if a response looks like the agent is asking a clarifying question */
function isAskingQuestion(text) {
  const questionIndicators = [
    /\?(\s*$)/m,
    /could you (please |kindly )?clarify/i,
    /can you provide more/i,
    /what (do you|would you) (want|like|prefer)/i,
    /please (specify|clarify|tell me)/i,
  ];
  return questionIndicators.some(re => re.test(text));
}

module.exports = {
  parseResponse,
  formatToolResult,
  stripThinkingBlocks,
  isAskingQuestion,
};
