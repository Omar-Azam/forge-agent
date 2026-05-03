// src/logger.js — ANSI-colored terminal output (no dependencies)
'use strict';

const A = {
  reset   : '\x1b[0m',
  bold    : '\x1b[1m',
  dim     : '\x1b[2m',
  red     : '\x1b[31m',
  green   : '\x1b[32m',
  yellow  : '\x1b[33m',
  blue    : '\x1b[34m',
  magenta : '\x1b[35m',
  cyan    : '\x1b[36m',
  white   : '\x1b[37m',
  gray    : '\x1b[90m',
  lred    : '\x1b[91m',
  lgreen  : '\x1b[92m',
  lyellow : '\x1b[93m',
  lblue   : '\x1b[94m',
  lmagenta: '\x1b[95m',
  lcyan   : '\x1b[96m',
};

const c  = (code, text) => `${A[code]}${text}${A.reset}`;
const cb = (code, text) => `${A.bold}${A[code]}${text}${A.reset}`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function truncDisplay(str, max = 400) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= max) return s;
  return s.slice(0, max) + c('gray', `… (+${s.length - max} chars)`);
}

function jsonPreview(obj, max = 350) {
  const s = JSON.stringify(obj, null, 2);
  return truncDisplay(s, max);
}

// ── Public logger API ─────────────────────────────────────────────────────────
const logger = {
  banner() {
    console.log(`
${c('cyan','╔══════════════════════════════════════════════════╗')}
${c('cyan','║')}   ${cb('lcyan','🤖  DeepSeek Browser Agent')}                     ${c('cyan','║')}
${c('cyan','║')}   ${c('gray','AI Coding Agent via Browser Automation')}         ${c('cyan','║')}
${c('cyan','║')}   ${c('gray','No API key needed — uses chat.deepseek.com')}     ${c('cyan','║')}
${c('cyan','╚══════════════════════════════════════════════════╝')}
`);
  },

  header(msg) {
    const line = '─'.repeat(50);
    console.log(`\n${c('blue', line)}`);
    console.log(`${c('bold','📋 ')}${cb('white', msg)}`);
    console.log(`${c('blue', line)}\n`);
  },

  info(msg)    { console.log(`${c('lblue','  ℹ ')} ${msg}`); },
  success(msg) { console.log(`${c('lgreen','  ✓ ')} ${c('lgreen', msg)}`); },
  warn(msg)    { console.log(`${c('lyellow','  ⚠ ')} ${c('lyellow', msg)}`); },
  error(msg)   { console.log(`${c('lred','  ✗ ')} ${c('lred', msg)}`); },
  dim(msg)     { console.log(`${A.dim}    ${msg}${A.reset}`); },

  /** Spinner-style line (overwrites itself with \r) */
  thinking(msg) {
    process.stdout.write(`  ${c('cyan','⟳')} ${c('gray', msg)}\r`);
  },

  /** Clear the current line */
  clearLine() {
    process.stdout.write(`\r${' '.repeat(80)}\r`);
  },

  // ── Tool call display ───────────────────────────────────────────────────────
  toolCall(name, args) {
    console.log(`\n  ${cb('magenta','⚡ TOOL CALL')} ${c('cyan', `→ ${name}`)}`);
    const preview = jsonPreview(args);
    if (preview.trim()) {
      preview.split('\n').forEach(l => console.log(`  ${c('gray', l)}`));
    }
  },

  toolResult(result, isError = false) {
    const icon   = isError ? c('lred','  ✗ Result:') : c('lgreen','  ✓ Result:');
    const text   = truncDisplay(String(result), 300);
    const color  = isError ? 'lred' : 'gray';
    console.log(`${icon}`);
    text.split('\n').slice(0, 12).forEach(l => console.log(`  ${c(color, l)}`));
    if (String(result).split('\n').length > 12) {
      console.log(`  ${c('gray','  … (truncated for display)')}`);
    }
    console.log('');
  },

  // ── Final agent output ──────────────────────────────────────────────────────
  finalOutput(msg) {
    const line = '━'.repeat(50);
    console.log(`\n${c('lgreen', line)}`);
    console.log(`${cb('lgreen','✅  TASK COMPLETE')}`);
    console.log(`${c('lgreen', line)}\n`);
    console.log(msg);
    console.log('');
  },

  // ── Section separator ───────────────────────────────────────────────────────
  separator(label = '') {
    const pad = label ? ` ${label} ` : '';
    console.log(`\n${c('gray', '·'.repeat(20) + pad + '·'.repeat(20))}\n`);
  },

  // ── Iteration marker ────────────────────────────────────────────────────────
  iteration(n, max) {
    console.log(`\n${c('gray','  ┄')} ${c('dim',`Step ${n}/${max}`)} ${c('gray','┄')}`);
  },
};

module.exports = logger;
