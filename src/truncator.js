// src/truncator.js — Smart truncation and summarisation
'use strict';

const config = require('./config');

/**
 * Detect the type of content in the text.
 */
function detectContentType(text) {
  if (!text) return 'text';

  const trimmed = text.trim();

  // JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Might still be JSON-like
      if (trimmed.includes('"') && trimmed.includes(':')) return 'json';
    }
  }

  // Git Output
  if (/^(commit [a-f0-9]+|diff --git|@@ -\d+,\d+ \+\d+,\d+ @@)/m.test(text)) {
    return 'git_output';
  }

  // Test Output (Jest, pytest, etc)
  if (/Tests:.*passed.*total|FAIL |describe\(|it\(|PASS |FAILED |PASSED /m.test(text)) {
    return 'test_output';
  }

  // File List
  const lines = text.split('\n');
  if (lines.length > 5 && lines.slice(0, 10).every(l => l.includes('/') || l.includes('.') || l.startsWith('📁') || l.startsWith('📄') || l.trim() === '')) {
    return 'file_list';
  }

  // Code
  if (/(function\s+\w+|class\s+\w+|import\s+.*from|def\s+\w+\(|if\s+__name__\s*==\s*['"]__main__['"])/m.test(text)) {
    return 'code';
  }

  return 'text';
}

/**
 * Main entry point for truncation.
 */
function smartTruncate(text, maxLength = config.MAX_OUTPUT_LENGTH, opts = {}) {
  if (!text || text.length <= maxLength) return text;

  // Respect config toggle
  if (config.SMART_TRUNCATION === false) {
    return truncateOldWay(text, maxLength);
  }

  try {
    const type = opts.type || detectContentType(text);
    let truncated;

    switch (type) {
      case 'code':
        truncated = truncateCode(text, maxLength);
        break;
      case 'test_output':
        truncated = truncateTestOutput(text, maxLength);
        break;
      case 'file_list':
        truncated = truncateFileList(text, maxLength);
        break;
      case 'git_output':
        truncated = truncateGitOutput(text, maxLength);
        break;
      case 'json':
        truncated = truncateJson(text, maxLength);
        break;
      default:
        truncated = truncateGeneric(text, maxLength);
    }

    // Safety check: if smart truncation somehow failed to stay under limit or returned empty
    if (!truncated || truncated.length > maxLength) {
      return truncateOldWay(text, maxLength);
    }

    return truncated;
  } catch (err) {
    // Never throw, fall back to hard cut
    return truncateOldWay(text, maxLength);
  }
}

/**
 * The original blunt head+tail cut.
 */
function truncateOldWay(str, max) {
  const s = String(str);
  if (s.length <= max) return s;
  
  const notice = max < 40 
    ? '[...]' 
    : `\n\n⚠ [OUTPUT TRUNCATED — ${s.length.toLocaleString()} chars total]\n\n`;
    
  const remaining = max - notice.length;
  if (remaining <= 0) return s.slice(0, max);

  const head = Math.floor(remaining * 0.6);
  const tail = remaining - head;
  return s.slice(0, head) + notice + s.slice(-tail);
}

/**
 * Source code: Keep top (60%) and bottom (20%).
 */
function truncateCode(text, maxLength) {
  const lines = text.split('\n');
  const notice = `\n// ... [${lines.length} lines total — middle truncated] ...\n`;
  
  if (maxLength < 100) return truncateOldWay(text, maxLength);

  // Use character count budget for lines
  let headLines = [];
  let tailLines = [];
  let currentLen = notice.length;
  
  // Allocate 60% for head, 20% for tail
  const headBudget = Math.floor((maxLength - notice.length) * 0.6);
  const tailBudget = Math.floor((maxLength - notice.length) * 0.2);

  let headIdx = 0;
  let headActualLen = 0;
  while (headIdx < lines.length && headActualLen + lines[headIdx].length + 1 <= headBudget) {
    headActualLen += lines[headIdx].length + 1;
    headLines.push(lines[headIdx]);
    headIdx++;
  }

  let tailIdx = lines.length - 1;
  let tailActualLen = 0;
  while (tailIdx >= headIdx && tailActualLen + lines[tailIdx].length + 1 <= tailBudget) {
    tailActualLen += lines[tailIdx].length + 1;
    tailLines.unshift(lines[tailIdx]);
    tailIdx--;
  }

  return headLines.join('\n') + notice + tailLines.join('\n');
}

/**
 * Test output: Keep summary and FAIL blocks.
 */
function truncateTestOutput(text, maxLength) {
  const lines = text.split('\n');
  const summaryLine = lines.find(l => /Tests:.*total|Ran \d+ tests/.test(l));
  const notice = `\n\n⚠ [TEST OUTPUT TRUNCATED — original: ${lines.length} lines]\n`;
  
  if (maxLength < 100) return truncateOldWay(text, maxLength);

  const important = [];
  let currentLen = notice.length;
  const budget = maxLength - notice.length;

  function addLine(l) {
    if (currentLen + l.length + 1 <= budget) {
      important.push(l);
      currentLen += l.length + 1;
      return true;
    }
    return false;
  }

  let inFailureBlock = false;
  let failureLinesCount = 0;

  for (const line of lines) {
    const isSummary = line === summaryLine;
    const isFailure = line.includes('FAIL ') || line.includes('●') || line.includes('FAILED');

    if (isFailure) {
      inFailureBlock = true;
      failureLinesCount = 0;
    }

    if (isSummary || isFailure || (inFailureBlock && failureLinesCount < 10)) {
      if (addLine(line)) {
        if (inFailureBlock) failureLinesCount++;
      }
      if (line.trim() === '' || line.startsWith('PASS ')) inFailureBlock = false;
    } else if (important.length < 20) {
      addLine(line);
    }
  }

  if (summaryLine && !important.includes(summaryLine)) {
    addLine(summaryLine);
  }

  return important.join('\n') + notice;
}

/**
 * File list: Keep first 50, last 10.
 */
function truncateFileList(text, maxLength) {
  const lines = text.split('\n');
  if (lines.length <= 60) return text;

  const head = lines.slice(0, 50);
  const tail = lines.slice(-10);
  const omitted = lines.length - 60;
  
  const notice = `\n... [${omitted} more files omitted] ...\n`;
  return head.join('\n') + notice + tail.join('\n');
}

/**
 * Git output: Keep headers and first part of hunks.
 */
function truncateGitOutput(text, maxLength) {
  const lines = text.split('\n');
  const result = [];
  let hunkLineCount = 0;

  for (const line of lines) {
    // Headers are always kept
    if (line.startsWith('commit ') || line.startsWith('Author:') || line.startsWith('Date:') || line.startsWith('diff --git')) {
      result.push(line);
      hunkLineCount = 0;
      continue;
    }

    if (line.startsWith('@@')) {
      result.push(line);
      hunkLineCount = 0;
      continue;
    }

    // Truncate hunk content to 20 lines
    if (hunkLineCount < 20) {
      result.push(line);
      hunkLineCount++;
    } else if (hunkLineCount === 20) {
      result.push('    ... [diff hunk truncated]');
      hunkLineCount++;
    }
    
    if (result.join('\n').length > maxLength - 200) break;
  }

  const notice = `\n\n⚠ [GIT OUTPUT TRUNCATED — ${text.length} chars total]\n`;
  return result.join('\n') + notice;
}

/**
 * JSON: Depth limiting and array slicing.
 */
function truncateJson(text, maxLength) {
  try {
    const obj = JSON.parse(text);
    
    function process(val, depth = 0) {
      if (depth > 3) return '[Object]';
      
      if (Array.isArray(val)) {
        if (val.length > 20) {
          const sliced = val.slice(0, 10).map(i => process(i, depth + 1));
          sliced.push(`... ${val.length - 10} more items`);
          return sliced;
        }
        return val.map(i => process(i, depth + 1));
      }
      
      if (val !== null && typeof val === 'object') {
        const res = {};
        const keys = Object.keys(val);
        for (const key of keys.slice(0, 50)) {
          res[key] = process(val[key], depth + 1);
        }
        if (keys.length > 50) res['...'] = `${keys.length - 50} more keys`;
        return res;
      }
      
      return val;
    }

    const processed = process(obj);
    const result = JSON.stringify(processed, null, 2);
    
    if (result.length > maxLength) {
      return truncateOldWay(text, maxLength);
    }
    return result;
  } catch {
    return truncateGeneric(text, maxLength);
  }
}

/**
 * Generic: Keep head (40%) and tail (20%).
 */
function truncateGeneric(text, maxLength) {
  const notice = `\n\n[... content truncated ...]\n\n`;
  const remaining = maxLength - notice.length;
  if (remaining <= 0) return text.slice(0, maxLength);

  const headLen = Math.floor(remaining * 0.4);
  const tailLen = Math.floor(remaining * 0.2);
  
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  
  return head + notice + tail;
}

module.exports = {
  detectContentType,
  smartTruncate
};
