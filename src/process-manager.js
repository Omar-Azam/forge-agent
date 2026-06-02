// src/process-manager.js — Background process lifecycle manager
//
// Processes are stored in a module-level Map so they persist across
// tool calls within the same agent session.
//
// Supports: start, stop, restart, status, list, read output
//
'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const os         = require('os');
const fs         = require('fs');

// ─────────────────────────────────────────────
//  Process registry — survives between tool calls
// ─────────────────────────────────────────────

// Map<name, ProcessEntry>
const REGISTRY = new Map();

const MAX_LOG_LINES = 500; // per process

// ─────────────────────────────────────────────
//  ProcessEntry shape
// ─────────────────────────────────────────────

/*
{
  name     : string,
  command  : string,
  cwd      : string,
  pid      : number | null,
  status   : 'running' | 'stopped' | 'crashed' | 'starting',
  startedAt: number,
  exitCode : number | null,
  logs     : string[],       // circular buffer of recent output lines
  process  : ChildProcess | null,
  env      : object,
}
*/

// ─────────────────────────────────────────────
//  Start a process
// ─────────────────────────────────────────────

/**
 * Start a background process.
 *
 * @param {string} name     - Unique name to reference this process
 * @param {string} command  - Shell command to run
 * @param {Object} opts
 * @param {string} opts.cwd   - Working directory
 * @param {Object} opts.env   - Extra environment variables
 * @param {boolean} opts.replace - Replace existing process with same name
 * @returns {StartResult}
 */
function startProcess(name, command, opts = {}) {
  const { cwd = process.cwd(), env = {}, replace = false } = opts;

  // Validate name
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error(
      `Invalid process name: "${name}". Use only letters, digits, hyphens, and underscores.`
    );
  }

  // Check for existing
  if (REGISTRY.has(name)) {
    const existing = REGISTRY.get(name);
    if (existing.status === 'running' && !replace) {
      return {
        started : false,
        name,
        pid     : existing.pid,
        message : `Process "${name}" is already running (PID ${existing.pid}). Use replace:true to restart it.`,
      };
    }
    // Stop existing before replacing
    if (existing.process) {
      try { existing.process.kill('SIGTERM'); } catch {}
    }
  }

  const entry = {
    name,
    command,
    cwd,
    pid      : null,
    status   : 'starting',
    startedAt: Date.now(),
    exitCode : null,
    logs     : [],
    process  : null,
    env      : { ...process.env, ...env },
  };

  REGISTRY.set(name, entry);

  // Spawn using shell so npm scripts, pipes, etc. work
  const child = spawn(command, [], {
    cwd,
    shell : true,
    env   : entry.env,
    stdio : ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  entry.process = child;
  entry.pid     = child.pid;
  entry.status  = 'running';

  // Collect stdout
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    entry.logs.push(...lines.map(l => `[stdout] ${l}`));
    if (entry.logs.length > MAX_LOG_LINES) {
      entry.logs = entry.logs.slice(-MAX_LOG_LINES);
    }
  });

  // Collect stderr
  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    entry.logs.push(...lines.map(l => `[stderr] ${l}`));
    if (entry.logs.length > MAX_LOG_LINES) {
      entry.logs = entry.logs.slice(-MAX_LOG_LINES);
    }
  });

  // Handle exit
  child.on('exit', (code, signal) => {
    entry.exitCode = code;
    entry.status   = (code === 0 || signal === 'SIGTERM') ? 'stopped' : 'crashed';
    entry.process  = null;
    entry.logs.push(`[system] Process exited with code ${code}, signal ${signal}`);
  });

  child.on('error', (err) => {
    entry.status = 'crashed';
    entry.logs.push(`[system] Spawn error: ${err.message}`);
  });

  return {
    started: true,
    name,
    pid    : child.pid,
    message: `Started "${name}" (PID ${child.pid}): ${command}`,
  };
}

// ─────────────────────────────────────────────
//  Stop a process
// ─────────────────────────────────────────────

/**
 * Stop a running process by name.
 *
 * @param {string} name     - Process name
 * @param {string} signal   - Signal to send (default: SIGTERM)
 * @returns {StopResult}
 */
function stopProcess(name, signal = 'SIGTERM') {
  const entry = REGISTRY.get(name);

  if (!entry) {
    return { stopped: false, name, message: `No process named "${name}" found.` };
  }

  if (entry.status !== 'running' || !entry.process) {
    return { stopped: false, name, message: `Process "${name}" is not running (status: ${entry.status}).` };
  }

  try {
    entry.process.kill(signal);
    entry.status = 'stopped';
    return { stopped: true, name, pid: entry.pid, message: `Sent ${signal} to "${name}" (PID ${entry.pid})` };
  } catch (err) {
    return { stopped: false, name, message: `Failed to stop "${name}": ${err.message}` };
  }
}

// ─────────────────────────────────────────────
//  Get process status
// ─────────────────────────────────────────────

/**
 * Get the current status of a process.
 */
function getProcessStatus(name) {
  const entry = REGISTRY.get(name);
  if (!entry) return null;

  const uptime = entry.status === 'running'
    ? Math.round((Date.now() - entry.startedAt) / 1000) + 's'
    : null;

  return {
    name     : entry.name,
    command  : entry.command,
    cwd      : entry.cwd,
    pid      : entry.pid,
    status   : entry.status,
    uptime,
    exitCode : entry.exitCode,
    logLines : entry.logs.length,
  };
}

// ─────────────────────────────────────────────
//  List all processes
// ─────────────────────────────────────────────

function listProcesses() {
  return [...REGISTRY.keys()].map(name => getProcessStatus(name));
}

// ─────────────────────────────────────────────
//  Read process output
// ─────────────────────────────────────────────

/**
 * Get recent log output from a process.
 *
 * @param {string} name   - Process name
 * @param {number} lines  - How many recent lines to return (default: 50)
 * @param {string} filter - Only return lines matching this string
 */
function getProcessLogs(name, lines = 50, filter = null) {
  const entry = REGISTRY.get(name);
  if (!entry) return null;

  let logs = entry.logs;
  if (filter) {
    const re = new RegExp(filter, 'i');
    logs = logs.filter(l => re.test(l));
  }

  return logs.slice(-lines);
}

// ─────────────────────────────────────────────
//  Wait for output
// ─────────────────────────────────────────────

/**
 * Wait until a process logs a line matching `readyPattern`.
 * Useful for dev servers that take time to start.
 *
 * @param {string} name          - Process name
 * @param {string} readyPattern  - Regex pattern indicating server is ready
 * @param {number} timeoutMs     - Max wait time (default: 30000)
 * @returns {Promise<boolean>}
 */
function waitForReady(name, readyPattern, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const re      = new RegExp(readyPattern, 'i');
    const start   = Date.now();
    const entry   = REGISTRY.get(name);

    if (!entry) { resolve(false); return; }

    // Check existing logs first
    if (entry.logs.some(l => re.test(l))) { resolve(true); return; }

    const check = setInterval(() => {
      const e = REGISTRY.get(name);
      if (!e || e.status === 'crashed') {
        clearInterval(check);
        resolve(false);
        return;
      }

      if (e.logs.some(l => re.test(l))) {
        clearInterval(check);
        resolve(true);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        clearInterval(check);
        resolve(false);
      }
    }, 200);
  });
}

// ─────────────────────────────────────────────
//  Format helpers
// ─────────────────────────────────────────────

function statusIcon(status) {
  switch (status) {
    case 'running':  return '🟢';
    case 'stopped':  return '⚫';
    case 'crashed':  return '🔴';
    case 'starting': return '🟡';
    default:         return '❓';
  }
}

function formatProcessList(processes) {
  if (processes.length === 0) {
    return 'No background processes running.\nUse start_process to launch one.';
  }

  const lines = [`${processes.length} process(es):\n`];
  for (const p of processes) {
    const uptime = p.uptime ? ` · up ${p.uptime}` : '';
    const pid    = p.pid    ? ` · PID ${p.pid}` : '';
    lines.push(`  ${statusIcon(p.status)} ${p.name} [${p.status}]${pid}${uptime}`);
    lines.push(`     ${p.command}`);
    lines.push(`     ${p.cwd}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatProcessLogs(name, logs, status) {
  if (!logs) return `No process named "${name}" found.`;
  if (logs.length === 0) return `No output from "${name}" yet.`;

  const lines = [`Output from "${name}" [${status}] — last ${logs.length} line(s):\n`];
  lines.push(...logs);
  return lines.join('\n');
}

module.exports = {
  startProcess,
  stopProcess,
  getProcessStatus,
  listProcesses,
  getProcessLogs,
  waitForReady,
  formatProcessList,
  formatProcessLogs,
  REGISTRY,        // exported for testing
  statusIcon,
};
