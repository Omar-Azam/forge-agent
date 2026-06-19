'use strict';

const { TUI, color, colors, stripAnsi } = require('./tui');

// Module-level TUI instance (shared across all imports)
let _tui = null;
let _config = {};

function getTUI() {
  if (!_tui) {
    _tui = new TUI({
      compact : _config.COMPACT_OUTPUT || false,
      noColor : !process.stdout.isTTY || process.env.NO_COLOR !== undefined || _config.NO_COLOR || _config.NO_TUI,
      debug   : _config.DEBUG || false,
    });
  }
  return _tui;
}

// Allow external code to reinitialise TUI with config
function initTUI(config = {}) {
  _config = config;
  _tui    = new TUI({
    compact : config.COMPACT_OUTPUT || false,
    noColor : !process.stdout.isTTY || process.env.NO_COLOR !== undefined || config.NO_COLOR || config.NO_TUI,
    debug   : config.DEBUG || false,
  });
  return _tui;
}

// Keep TUI instance in sync with latest config
function updateTUIConfig(config = {}) {
  _config = { ..._config, ...config };
  const tui = getTUI();
  if (config.COMPACT_OUTPUT !== undefined) tui.compact = config.COMPACT_OUTPUT;
  if (config.DEBUG !== undefined)          tui.debug   = config.DEBUG;
  if (config.NO_TUI !== undefined || config.NO_COLOR !== undefined) {
    tui.noColor = !process.stdout.isTTY || process.env.NO_COLOR !== undefined || config.NO_COLOR || config.NO_TUI;
  }
}

// Called when config changes to keep TUI in sync
function updateRunContext(config) {
  const tui = getTUI();
  if (tui && tui.setRunContext) {
    tui.setRunContext({
      model   : config.MODEL    || 'deepseek',
      profile : config.ACTIVE_PROFILE || 'default',
      maxSteps: config.MAX_ITERATIONS || 100,
    });
  }
}

const logger = {
  // ── TUI management ──────────────────────────────────────────────────────
  initTUI,
  updateTUIConfig,
  updateRunContext,
  getTUI,

  // ── Core messages ────────────────────────────────────────────────────────
  banner()        { getTUI().banner(); },
  info(msg)       { getTUI().info(msg); },
  success(msg)    { getTUI().success(msg); },
  warn(msg)       { getTUI().warn(msg); },
  error(msg)      { getTUI().error(msg); },
  dim(msg)        { getTUI().dim(msg); },
  separator(label){ getTUI().separator(label); },

  // ── Task lifecycle ────────────────────────────────────────────────────────
  header(task, opts = {}) {
    getTUI().renderTaskHeader(task, opts);
  },

  iteration(n, max) {
    // Legacy compatibility — use renderStepLine
    getTUI().renderStepLine(n, 0, null, max);
  },

  // ── Tool display ──────────────────────────────────────────────────────────
  toolCall(name, args) {
    getTUI().renderToolCall(name, args);
  },

  toolResult(result, isError = false, toolName = '') {
    getTUI().renderToolResult(toolName, result, isError);
  },

  // ── AI interaction ────────────────────────────────────────────────────────
  thinking(msg) {
    getTUI().renderThinking(msg);
  },

  waiting(elapsedMs, charsReceived, model) {
    getTUI().renderWaiting(elapsedMs, charsReceived, model);
  },

  clearWaiting() {
    getTUI().clearWaiting();
  },

  // ── Completion ────────────────────────────────────────────────────────────
  finalOutput(progress, status) {
    // If progress is a string (legacy call), we still show it
    if (typeof progress === 'string' && !status) {
      console.log(progress);
      return;
    }
    getTUI().renderCompletion(progress, status);
  },

  // ── Context meter ─────────────────────────────────────────────────────────
  contextMeter(used, max) {
    getTUI().renderContextMeter(used, max);
  },

  // ── Health check ──────────────────────────────────────────────────────────
  healthCheck(checks) {
    getTUI().renderHealthCheck(checks);
  },

  // ── Error display ─────────────────────────────────────────────────────────
  renderError(err) {
    getTUI().renderError(err);
  },

  // ── Step line (used in agent loop) ────────────────────────────────────────
  stepLine(stepNum, elapsedMs, progress) {
    getTUI().renderStepLine(stepNum, elapsedMs, progress);
  },

  // ── Clearline (for overwrite-style output) ────────────────────────────────
  clearLine() {
    if (process.stdout.isTTY) {
      process.stdout.write(`\r${' '.repeat(80)}\r`);
    }
  },
};

module.exports = logger;
