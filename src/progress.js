// src/progress.js — Task progress tracker for graceful timeout handling
//
// Records every tool call and result so that if a task times out or hits
// max iterations, we can return a useful partial summary instead of nothing.
//
'use strict';

// ─────────────────────────────────────────────
//  Step types
// ─────────────────────────────────────────────

const STEP = {
  TOOL_CALL   : 'tool_call',
  TOOL_RESULT : 'tool_result',
  AI_RESPONSE : 'ai_response',
  ERROR       : 'error',
  SYSTEM      : 'system',
};

// ─────────────────────────────────────────────
//  ProgressTracker
// ─────────────────────────────────────────────

class ProgressTracker {
  constructor(task) {
    this.task       = task;
    this.startedAt  = Date.now();
    this.steps      = [];
    this.filesWritten  = new Set();
    this.filesRead     = new Set();
    this.commandsRun   = [];
    this.errorCount    = 0;
    this.toolCallCount = 0;
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  recordToolCall(name, args) {
    this.toolCallCount++;

    // Track specific tool types for the summary
    if (name === 'write_file' || name === 'write_files') {
      const paths = name === 'write_files'
        ? (args.files || []).map(f => f.path)
        : [args.path];
      paths.filter(Boolean).forEach(p => this.filesWritten.add(p));
    }

    if (name === 'read_file') {
      if (args.path) this.filesRead.add(args.path);
    }

    if (name === 'run_command') {
      if (args.command) this.commandsRun.push(args.command.slice(0, 80));
    }

    this.steps.push({
      type      : STEP.TOOL_CALL,
      name,
      args      : _summariseArgs(args),
      timestamp : Date.now(),
    });
  }

  recordToolResult(name, result, isError) {
    if (isError) this.errorCount++;

    this.steps.push({
      type      : STEP.TOOL_RESULT,
      name,
      isError,
      result    : String(result).slice(0, 200),
      timestamp : Date.now(),
    });
  }

  recordAiResponse(content) {
    this.steps.push({
      type      : STEP.AI_RESPONSE,
      content   : content.slice(0, 200),
      timestamp : Date.now(),
    });
  }

  recordError(message) {
    this.errorCount++;
    this.steps.push({
      type      : STEP.ERROR,
      message   : message.slice(0, 200),
      timestamp : Date.now(),
    });
  }

  // ── Summary generation ─────────────────────────────────────────────────────

  /**
   * Generate a partial result summary.
   * Called when a task times out or hits max iterations.
   */
  buildPartialSummary(reason = 'timeout') {
    const elapsed   = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    const lines     = [];

    lines.push('⚠  Task did not complete — ' + reason);
    lines.push('');
    lines.push('TASK: ' + this.task.slice(0, 120));
    lines.push('TIME: ' + elapsed + 's elapsed, ' + this.toolCallCount + ' steps taken');
    lines.push('');

    // What was accomplished
    const accomplished = this._getAccomplished();
    if (accomplished.length > 0) {
      lines.push('COMPLETED:');
      accomplished.forEach(a => lines.push('  ✓ ' + a));
      lines.push('');
    }

    // Files created
    if (this.filesWritten.size > 0) {
      lines.push('FILES CREATED/WRITTEN (' + this.filesWritten.size + '):');
      [...this.filesWritten].slice(0, 10).forEach(f => lines.push('  • ' + f));
      if (this.filesWritten.size > 10) {
        lines.push('  … and ' + (this.filesWritten.size - 10) + ' more');
      }
      lines.push('');
    }

    // Commands run
    if (this.commandsRun.length > 0) {
      lines.push('COMMANDS RUN (' + this.commandsRun.length + '):');
      this.commandsRun.slice(-5).forEach(c => lines.push('  $ ' + c));
      lines.push('');
    }

    // Errors
    if (this.errorCount > 0) {
      lines.push('ERRORS: ' + this.errorCount + ' error(s) occurred during execution');
      lines.push('');
    }

    // What to do next
    lines.push('TO RESUME: Run the agent again with the same task.');
    lines.push('           The files created above are saved to disk.');

    lines.push('           Consider increasing RESPONSE_TIMEOUT in your config.');

    return lines.join('\n');
  }

  /**
   * Generate a one-line progress status for display during execution.
   */
  getStatusLine() {
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(0);
    const parts   = [elapsed + 's'];
    if (this.toolCallCount > 0)   parts.push(this.toolCallCount + ' steps');
    if (this.filesWritten.size > 0) parts.push(this.filesWritten.size + ' files written');
    if (this.errorCount > 0)      parts.push(this.errorCount + ' errors');
    return parts.join(' · ');
  }

  /**
   * Returns elapsed time in milliseconds.
   */
  get elapsedMs() {
    return Date.now() - this.startedAt;
  }

  /**
   * Returns true if any meaningful work has been done.
   */
  get hasProgress() {
    return this.toolCallCount > 0 || this.filesWritten.size > 0;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _getAccomplished() {
    const done = [];

    // Deduce accomplishments from tool call history
    const toolGroups = {};
    for (const step of this.steps) {
      if (step.type !== STEP.TOOL_CALL) continue;
      toolGroups[step.name] = (toolGroups[step.name] || 0) + 1;
    }

    if (toolGroups.write_file || toolGroups.write_files) {
      const count = (toolGroups.write_file || 0) + (toolGroups.write_files || 0);
      done.push('Wrote ' + this.filesWritten.size + ' file(s) (' + count + ' write operations)');
    }
    if (toolGroups.read_file) {
      done.push('Read ' + toolGroups.read_file + ' file(s)');
    }
    if (toolGroups.run_command) {
      done.push('Ran ' + toolGroups.run_command + ' shell command(s)');
    }
    if (toolGroups.create_directory) {
      done.push('Created ' + toolGroups.create_directory + ' director(y/ies)');
    }
    if (toolGroups.list_directory || toolGroups.find_files || toolGroups.search_in_files) {
      done.push('Explored the project structure');
    }
    if (toolGroups.read_url) {
      done.push('Fetched ' + toolGroups.read_url + ' URL(s) for reference');
    }

    return done;
  }
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Truncate args for storage — keep it compact */
function _summariseArgs(args) {
  if (!args || typeof args !== 'object') return {};
  const summary = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 100) {
      summary[k] = v.slice(0, 100) + '…';
    } else {
      summary[k] = v;
    }
  }
  return summary;
}

module.exports = { ProgressTracker, STEP };
