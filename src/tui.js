'use strict';

// ─────────────────────────────────────────────
//  ANSI color system
// ─────────────────────────────────────────────

const C = {
  // Base colors
  reset   : '\x1b[0m',
  bold    : '\x1b[1m',
  dim     : '\x1b[2m',
  italic  : '\x1b[3m',

  // Foreground
  black   : '\x1b[30m',
  red     : '\x1b[31m',
  green   : '\x1b[32m',
  yellow  : '\x1b[33m',
  blue    : '\x1b[34m',
  magenta : '\x1b[35m',
  cyan    : '\x1b[36m',
  white   : '\x1b[37m',
  gray    : '\x1b[90m',

  // Bright foreground
  lred    : '\x1b[91m',
  lgreen  : '\x1b[92m',
  lyellow : '\x1b[93m',
  lblue   : '\x1b[94m',
  lmagenta: '\x1b[95m',
  lcyan   : '\x1b[96m',
  lwhite  : '\x1b[97m',

  // Background
  bgBlack : '\x1b[40m',
  bgGray  : '\x1b[100m',
};

// Check if we should use colors
function supportsColor() {
  return process.stdout.isTTY &&
         process.env.NO_COLOR === undefined &&
         process.env.TERM !== 'dumb';
}

function color(code, text) {
  if (!supportsColor()) return text;
  return `${C[code] || ''}${text}${C.reset}`;
}

function colors(codes, text) {
  if (!supportsColor()) return text;
  const prefix = codes.map(c => C[c] || '').join('');
  return `${prefix}${text}${C.reset}`;
}

// ─────────────────────────────────────────────
//  Layout constants
// ─────────────────────────────────────────────

function getWidth() {
  return Math.min(process.stdout.columns || 80, 100);
}

function padEnd(str, len) {
  const visible = stripAnsi(str);
  const pad     = Math.max(0, len - visible.length);
  return str + ' '.repeat(pad);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function truncate(str, max, ellipsis = '…') {
  if (!str) return '';
  const s = String(str).replace(/\n/g, ' ');
  if (s.length <= max) return s;
  return s.slice(0, max - ellipsis.length) + ellipsis;
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

function formatElapsed(startTime) {
  return formatMs(Date.now() - startTime);
}

// ─────────────────────────────────────────────
//  TUI class
// ─────────────────────────────────────────────

class TUI {
  constructor(opts = {}) {
    this.compact    = opts.compact    || false;
    this.noColor    = opts.noColor    || !supportsColor();
    this.debug      = opts.debug      || false;
    this.startTime  = null;
    this.taskText   = '';
    this.stepNum    = 0;
    this.maxSteps   = 100;
    this.model      = 'deepseek';
    this.profile    = 'default';
    this._lastToolName = '';
  }

  // ─────────────────────────────────────────────
  //  Status bar
  // ─────────────────────────────────────────────

  // Allow external code to update the TUI's notion of current model/profile
  setRunContext(opts = {}) {
    if (opts.model   !== undefined) this.model   = opts.model;
    if (opts.profile !== undefined) this.profile = opts.profile;
    if (opts.maxSteps !== undefined) this.maxSteps = opts.maxSteps;
  }

  /**
   * Render the top status bar. Called once at task start.
   *
   * Example output:
   * ╭─ 🔨 Forge Agent ──────────── deepseek · backend · step 0/100 ─╮
   * │  Task: build a REST API with Express and JWT authentication      │
   * ╰──────────────────────────────────────────────────────────────────╯
   */
  renderTaskHeader(task, opts = {}) {
    const {
      model       = 'deepseek',
      profile     = 'default',
    } = opts;

    this.startTime = Date.now();
    this.taskText  = task;
    this.model     = model;
    this.profile   = profile;
    this.stepNum   = 0;

    const width   = getWidth();
    const title   = colors(['bold', 'lcyan'], '🔨 Forge Agent');
    const meta    = color('gray', `${model} · ${profile}`);
    const taskStr = truncate(task, width - 6);

    const topLine   = this._drawHRule('╭', '╮', '─', title + ' ', ' ' + meta, width);
    const taskLine  = this._drawContentLine('│', '│', color('gray', 'Task: ') + taskStr, width);
    const botLine   = this._drawHRule('╰', '╯', '─', '', '', width);

    this._print([topLine, taskLine, botLine, ''].join('\n'));
  }

  // ─────────────────────────────────────────────
  //  Step divider
  // ─────────────────────────────────────────────

  /**
   * Render a step divider line.
   *
   * Example:
   * ─── Step 3 ─────────────────────── 14s · 2 files · 0 errors ───
   */
  renderStepLine(stepNum, elapsedMs, progress) {
    this.stepNum = stepNum;
    const width  = getWidth();

    const stepStr = colors(['bold', 'white'], `Step ${stepNum}`);
    const elapsed = color('gray', formatMs(elapsedMs || 0));

    // Right side stats
    const parts = [elapsed];
    if (progress) {
      if (progress.filesWritten && progress.filesWritten.size > 0) {
        parts.push(color('lgreen', `${progress.filesWritten.size} file${progress.filesWritten.size !== 1 ? 's' : ''}`));
      }
      if (progress.errorCount > 0) {
        parts.push(color('lred', `${progress.errorCount} error${progress.errorCount !== 1 ? 's' : ''}`));
      }
      if (progress.toolCallCount > 0 && this.debug) {
        parts.push(color('gray', `${progress.toolCallCount} calls`));
      }
    }
    const rightStr = parts.join(color('gray', ' · '));

    this._print(this._drawStepDivider(stepStr, rightStr, width));
  }

  // ─────────────────────────────────────────────
  //  Tool call display
  // ─────────────────────────────────────────────

  /**
   * Render a tool call line.
   *
   * Example:
   *   ⚡ write_file            src/auth/login.js
   */
  renderToolCall(toolName, args) {
    this._lastToolName = toolName;
    if (this.compact) return; // compact mode: skip tool call preview

    const width   = getWidth();
    const nameCol = 22;
    const argStr  = this._extractArgPreview(toolName, args);

    const icon    = colors(['bold', 'lyellow'], '  ⚡');
    const name    = color('cyan', toolName.padEnd(nameCol));
    const arg     = color('gray', truncate(argStr, width - nameCol - 8));

    this._print(`${icon} ${name} ${arg}`);
  }

  /**
   * Render a tool result line.
   *
   * Example:
   *   ✓  write_file            ✓ Wrote 2.1 KB → src/auth/login.js
   *   ✗  run_command           Error: command not found: npx
   */
  renderToolResult(toolName, result, isError = false) {
    const width   = getWidth();
    const nameCol = 22;

    const icon = isError
      ? colors(['bold', 'lred'],   '  ✗')
      : colors(['bold', 'lgreen'], '  ✓');

    const name = isError
      ? color('red',   (toolName || this._lastToolName).padEnd(nameCol))
      : color('green', (toolName || this._lastToolName).padEnd(nameCol));

    const resultStr = typeof result === 'string' ? result : String(result);
    const firstLine = resultStr.split('\n')[0];
    const preview   = truncate(firstLine, width - nameCol - 8);

    const resultDisplay = isError
      ? color('lred', preview)
      : color('gray', preview);

    this._print(`${icon} ${name} ${resultDisplay}`);

    // In debug mode: show up to 3 more lines of result
    if (this.debug && resultStr.split('\n').length > 1) {
      const extra = resultStr.split('\n').slice(1, 4);
      extra.forEach(line => {
        this._print(color('gray', `         ${truncate(line, width - 10)}`));
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Context window meter
  // ─────────────────────────────────────────────

  /**
   * Render context usage meter.
   *
   * Example:
   *   Context  ████████░░░░░░░░  42%  (34k / 80k tokens)
   */
  renderContextMeter(usedTokens, maxTokens) {
    if (!this.debug && usedTokens < maxTokens * 0.7) return; // only show when > 70% unless debug

    const width   = getWidth();
    const pct     = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
    const barLen  = 20;
    const filled  = Math.round((pct / 100) * barLen);
    const empty   = barLen - filled;

    const barColor = pct > 85 ? 'lred' : pct > 60 ? 'lyellow' : 'lgreen';
    const bar      = color(barColor, '█'.repeat(filled)) + color('gray', '░'.repeat(empty));

    const pctStr   = `${pct}%`.padStart(4);
    const tokenStr = `(${this._formatTokens(usedTokens)} / ${this._formatTokens(maxTokens)})`;

    this._print(
      color('gray', '  Context ') +
      bar + ' ' +
      color(barColor, pctStr) + ' ' +
      color('gray', tokenStr)
    );

    if (pct > 85) {
      this._print(color('lyellow', '  ⚠  Context nearly full — use /compact to compress'));
    }
  }

  // ─────────────────────────────────────────────
  //  Thinking indicator
  // ─────────────────────────────────────────────

  /**
   * Show thinking/reasoning display.
   *
   * Example:
   *   💭  Thinking... (23s)
   * or in debug:
   *   💭  The user wants to build an auth system. First I should...
   */
  renderThinking(text, elapsedMs) {
    const width = getWidth();
    if (!text || !text.trim()) {
      // Just show the indicator
      const timeStr = elapsedMs ? color('gray', ` (${formatMs(elapsedMs)})`) : '';
      this._print(colors(['dim', 'magenta'], `  💭  Thinking...`) + timeStr);
      return;
    }

    if (this.debug) {
      // Show first 2 lines of thinking content
      const lines = text.split('\n').filter(l => l.trim()).slice(0, 2);
      lines.forEach(line => {
        this._print(colors(['dim', 'magenta'], `  💭  ${truncate(line, width - 8)}`));
      });
    } else {
      const timeStr = elapsedMs ? color('gray', ` (${formatMs(elapsedMs)})`) : '';
      this._print(colors(['dim', 'magenta'], `  💭  Thinking...`) + timeStr);
    }
  }

  // ─────────────────────────────────────────────
  //  Waiting indicator
  // ─────────────────────────────────────────────

  /**
   * Show waiting for AI response indicator (overwrites previous).
   *
   * Example (updates in place):
   *   ⟳  Waiting for deepseek... 34s (1.2 KB received)
   */
  renderWaiting(elapsedMs, charsReceived, modelName) {
    if (!process.stdout.isTTY) return; // can't overwrite in non-TTY

    const elapsed   = formatMs(elapsedMs || 0);
    const chars     = charsReceived > 0
      ? color('gray', ` (${(charsReceived / 1024).toFixed(1)} KB received)`)
      : '';
    const model     = modelName || this.model;
    const indicator = colors(['dim', 'cyan'], `  ⟳  Waiting for ${model}...`);
    const timeStr   = color('gray', ` ${elapsed}`);

    // Overwrite current line
    process.stdout.write(`\r${indicator}${timeStr}${chars}          `);
  }

  clearWaiting() {
    if (!process.stdout.isTTY) return;
    process.stdout.write(`\r${' '.repeat(80)}\r`);
  }

  // ─────────────────────────────────────────────
  //  Completion footer
  // ─────────────────────────────────────────────

  /**
   * Render the completion footer.
   *
   * Example:
   * ╔══════════════════════════════════════════════════════════════════╗
   * ║  ✅  Task complete  ·  47s  ·  12 steps  ·  5 files written      ║
   * ╚══════════════════════════════════════════════════════════════════╝
   */
  renderCompletion(progress, status = 'completed') {
    const width    = getWidth();
    const elapsed  = this.startTime ? formatMs(Date.now() - this.startTime) : '?';

    const statusIcon = status === 'completed' ? '✅' :
                       status === 'partial'   ? '⚠ ' :
                       status === 'timeout'   ? '⏱ ' : '❌';

    const statusText = status === 'completed' ? 'Task complete' :
                       status === 'partial'   ? 'Partial result (max iterations)' :
                       status === 'timeout'   ? 'Timeout — partial result' : 'Failed';

    const parts = [
      `${statusIcon}  ${statusText}`,
      elapsed,
      `${this.stepNum} steps`,
    ];

    if (progress) {
      if (progress.filesWritten && progress.filesWritten.size > 0) {
        const files = [...progress.filesWritten.values()];
        parts.push(`${files.length} file${files.length !== 1 ? 's' : ''}`);
      }
      if (progress.commandsRun && progress.commandsRun.length > 0) {
        parts.push(`${progress.commandsRun.length} command${progress.commandsRun.length !== 1 ? 's' : ''}`);
      }
      if (progress.errorCount > 0) {
        parts.push(color('lred', `${progress.errorCount} error${progress.errorCount !== 1 ? 's' : ''}`));
      }
    }

    const content   = parts.join(color('gray', '  ·  '));
    const boxColor  = status === 'completed' ? 'lgreen' :
                      status === 'partial'   ? 'lyellow' : 'lred';

    const top    = color(boxColor, '╔' + '═'.repeat(width - 2) + '╗');
    const middle = color(boxColor, '║') + '  ' + padEnd(content, width - 4) + color(boxColor, '║');
    const bottom = color(boxColor, '╚' + '═'.repeat(width - 2) + '╝');

    this._print('\n' + [top, middle, bottom].join('\n') + '\n');

    // If files were written: show them
    if (progress && progress.filesWritten && progress.filesWritten.size > 0) {
      this._print(color('gray', '  Files written:'));
      const files = [...progress.filesWritten.values()].slice(0, 10);
      files.forEach(f => this._print(color('gray', `    • ${f}`)));
      if (progress.filesWritten.size > 10) {
        this._print(color('gray', `    ... and ${progress.filesWritten.size - 10} more`));
      }
    }
  }

  // ─────────────────────────────────────────────
  //  Error display
  // ─────────────────────────────────────────────

  /**
   * Render an error box.
   *
   * Example:
   * ┌── Error ─────────────────────────────────────────────────────────┐
   * │  Cannot find the AI chat input box                                │
   * │  Run: forge-agent --calibrate to auto-detect new selectors        │
   * └──────────────────────────────────────────────────────────────────┘
   */
  renderError(err) {
    const width = getWidth();
    const msg   = err && err.message ? err.message : String(err);
    const lines = msg.split('\n').slice(0, 5); // max 5 lines

    const top    = color('lred', '┌── Error ' + '─'.repeat(width - 10) + '┐');
    const bottom = color('lred', '└' + '─'.repeat(width - 2) + '┘');
    const middle = lines.map(line =>
      color('lred', '│') + '  ' + color('lred', truncate(line, width - 4)) + color('lred', '')
    );

    this._print([top, ...middle, bottom].join('\n'));
  }

  // ─────────────────────────────────────────────
  //  Health check display
  // ─────────────────────────────────────────────

  /**
   * Render health check results.
   *
   * Example:
   * ·········· 🔨 Forge Agent — Session Health Check ··········
   *   ✓  Page loaded      https://chat.deepseek.com
   *   ✓  Logged in        Active session detected
   *   ✗  Input box        Not found — try forge-agent --calibrate
   */
  renderHealthCheck(checks) {
    const width = getWidth();
    const title = ' 🔨 Forge Agent — Session Health Check ';
    const pad   = Math.max(0, Math.floor((width - title.length) / 2));
    const line  = color('gray', '·'.repeat(pad) + title + '·'.repeat(pad));

    this._print('\n' + line + '\n');

    checks.forEach(check => {
      const icon = check.status === 'pass' ? color('lgreen', '  ✓')
                 : check.status === 'warn' ? color('lyellow', '  ⚠')
                 : color('lred', '  ✗');
      const name   = check.name.padEnd(18);
      const msg    = check.message || '';
      this._print(`${icon}  ${color('white', name)} ${color('gray', truncate(msg, width - 25))}`);
      if (check.fix && check.status !== 'pass') {
        this._print(color('gray', `       Fix: ${check.fix}`));
      }
    });

    this._print('');
  }

  // ─────────────────────────────────────────────
  //  Inline info/warn/dim messages
  // ─────────────────────────────────────────────

  info(msg)    { this._print(`${color('lblue', '  ℹ')}  ${msg}`); }
  success(msg) { this._print(`${color('lgreen', '  ✓')}  ${color('lgreen', msg)}`); }
  warn(msg)    { this._print(`${color('lyellow', '  ⚠')}  ${color('lyellow', msg)}`); }
  error(msg)   { this._print(`${color('lred', '  ✗')}  ${color('lred', msg)}`); }
  dim(msg)     { this._print(color('gray', `  ${msg}`)); }

  banner() {
    const width = getWidth();
    const line1 = colors(['bold', 'lcyan'], '  🔨  Forge Agent');
    const line2 = color('gray',            '  Autonomous AI Coding — No API Key Needed');
    const line3 = color('gray',            '  Commands: forge-agent  |  fa');
    const sep   = color('gray', '─'.repeat(width));

    this._print(['', sep, line1, line2, line3, sep, ''].join('\n'));
  }

  separator(label = '') {
    const width = getWidth();
    if (!label) {
      this._print(color('gray', '  ' + '·'.repeat(width - 4)));
      return;
    }
    const pad = Math.max(0, Math.floor((width - label.length - 4) / 2));
    this._print(color('gray', '  ' + '·'.repeat(pad) + ' ' + label + ' ' + '·'.repeat(pad)));
  }

  // ─────────────────────────────────────────────
  //  Drawing helpers
  // ─────────────────────────────────────────────

  _drawHRule(leftCap, rightCap, fill, leftContent, rightContent, width) {
    const leftVis  = stripAnsi(leftContent);
    const rightVis = stripAnsi(rightContent);
    const fillLen  = Math.max(0, width - 2 - leftVis.length - rightVis.length);
    return leftCap + leftContent + fill.repeat(fillLen) + rightContent + rightCap;
  }

  _drawContentLine(leftBorder, rightBorder, content, width) {
    const visible = stripAnsi(content);
    const pad     = Math.max(0, width - 2 - visible.length - 2);
    return `${leftBorder}  ${content}${' '.repeat(pad)}${rightBorder}`;
  }

  _drawStepDivider(leftContent, rightContent, width) {
    const leftVis  = stripAnsi(leftContent);
    const rightVis = stripAnsi(rightContent);
    const fill     = '─';
    const space    = Math.max(3, width - leftVis.length - rightVis.length - 8);
    return color('gray', '\n─── ') + leftContent + color('gray', ' ' + fill.repeat(space) + ' ') + rightContent + color('gray', ' ───');
  }

  _extractArgPreview(toolName, args) {
    if (!args) return '';
    if (args.path)                        return args.path;
    if (args.command)                     return truncate(args.command, 50);
    if (args.query)                       return args.query;
    if (args.key)                         return args.key;
    if (args.name && typeof args.name === 'string') return args.name;
    if (args.packages && Array.isArray(args.packages)) {
      return args.packages.slice(0, 3).join(', ');
    }
    if (args.directory)                   return args.directory;
    if (args.pattern)                     return args.pattern;
    // Find first string value in args
    for (const [k, v] of Object.entries(args || {})) {
      if (typeof v === 'string' && v.length < 60 && k !== 'content') return v;
    }
    return '';
  }

  _formatTokens(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
    return String(n);
  }

  _print(text) {
    if (this.noColor) {
      process.stdout.write(stripAnsi(text) + '\n');
    } else {
      process.stdout.write(text + '\n');
    }
  }
}

// ─────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────

module.exports = { TUI, color, colors, stripAnsi, truncate, padEnd, formatMs, formatElapsed, getWidth, supportsColor };
