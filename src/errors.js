// src/errors.js — Structured error system for Forge Agent
//
// Every error the user sees follows a consistent structure:
//   WHAT:  what operation failed
//   WHY:   the underlying cause
//   HOW:   concrete steps to fix it
//
'use strict';

// ─────────────────────────────────────────────
//  ANSI helpers (no dependencies)
// ─────────────────────────────────────────────

const A = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  red    : '\x1b[31m',
  yellow : '\x1b[33m',
  cyan   : '\x1b[36m',
  gray   : '\x1b[90m',
  lred   : '\x1b[91m',
};
const c = (code, t) => A[code] + t + A.reset;

// ─────────────────────────────────────────────
//  AgentError — base structured error class
// ─────────────────────────────────────────────

class AgentError extends Error {
  /**
   * @param {string} what  - What was being attempted
   * @param {string} why   - Why it failed (technical cause)
   * @param {string[]} how - Ordered list of fix suggestions
   * @param {Error} [cause] - Original underlying error
   */
  constructor(what, why, how = [], cause = null) {
    super(what);
    this.name    = 'AgentError';
    this.what    = what;
    this.why     = why;
    this.how     = Array.isArray(how) ? how : [how];
    this.cause   = cause;
  }

  /** Format for terminal display */
  format() {
    const lines = [
      '',
      c('lred', '  ✗ ' + this.what),
      '',
      c('bold', '  WHY:  ') + c('yellow', this.why),
    ];

    if (this.how.length > 0) {
      lines.push('');
      lines.push(c('bold', '  FIX:'));
      this.how.forEach((step, i) => {
        lines.push('    ' + c('cyan', (i + 1) + '.') + ' ' + step);
      });
    }

    if (this.cause && process.env.DEBUG === 'true') {
      lines.push('');
      lines.push(c('gray', '  Caused by: ' + this.cause.message));
    }

    lines.push('');
    return lines.join('\n');
  }

  /** Short one-liner for tool result feedback to AI */
  toToolString() {
    return [
      'Error: ' + this.what,
      'Reason: ' + this.why,
      this.how.length > 0 ? 'Suggestion: ' + this.how[0] : '',
    ].filter(Boolean).join('\n');
  }
}

// ─────────────────────────────────────────────
//  Error factories — one per failure domain
// ─────────────────────────────────────────────

const Errors = {

  // ── File system errors ────────────────────────────────────────────────────

  fileNotFound(filePath) {
    return new AgentError(
      `File not found: ${filePath}`,
      'The file does not exist at the specified path.',
      [
        `Check the path is correct: ${filePath}`,
        'Use list_directory to see what files are available',
        'Use find_files to search for the file by name',
      ]
    );
  },

  pathIsDirectory(filePath) {
    return new AgentError(
      `Cannot read file: ${filePath}`,
      'The path points to a directory, not a file.',
      [
        'Use list_directory to list the directory contents',
        `If you meant a file inside it, specify the full filename`,
      ]
    );
  },

  directoryNotFound(dirPath) {
    return new AgentError(
      `Directory not found: ${dirPath}`,
      'The directory does not exist.',
      [
        'Use create_directory to create it first',
        'Use list_directory on the parent to see what exists',
      ]
    );
  },

  pathIsNotDirectory(filePath) {
    return new AgentError(
      `Not a directory: ${filePath}`,
      'The path points to a file, not a directory.',
      [
        'Provide a directory path instead',
        'Use get_file_info to check what type a path is',
      ]
    );
  },

  permissionDenied(filePath, operation, cause) {
    return new AgentError(
      `Permission denied: cannot ${operation} ${filePath}`,
      'The process does not have the required filesystem permissions.',
      [
        `Check file permissions: ls -la ${filePath}`,
        `Try: chmod 644 ${filePath}  (for files)`,
        `Try: chmod 755 ${filePath}  (for directories)`,
        'Check if the file is owned by a different user',
      ],
      cause
    );
  },

  diskFull(filePath, cause) {
    return new AgentError(
      `Cannot write file: ${filePath}`,
      'The disk may be full or the file system is read-only.',
      [
        'Check available disk space: df -h',
        'Remove unnecessary files to free space',
        'Check if the target filesystem is mounted as read-only',
      ],
      cause
    );
  },

  // ── Command errors ─────────────────────────────────────────────────────────

  commandFailed(command, exitCode, stdout, stderr) {
    const output = [
      stdout && 'STDOUT:\n' + stdout,
      stderr && 'STDERR:\n' + stderr,
    ].filter(Boolean).join('\n\n');

    return new AgentError(
      `Command failed (exit ${exitCode}): ${command.slice(0, 60)}`,
      output || 'The command exited with a non-zero status code.',
      [
        'Check the command syntax is correct',
        'Make sure any required tools are installed',
        'Try running the command manually to see the full error',
      ]
    );
  },

  commandTimeout(command, timeoutMs) {
    return new AgentError(
      `Command timed out after ${timeoutMs / 1000}s: ${command.slice(0, 60)}`,
      'The command took longer than the allowed timeout.',
      [
        `Increase the timeout: run_command with timeout: ${timeoutMs * 2}`,
        'Check if the command is stuck waiting for input',
        'Break the command into smaller steps',
      ]
    );
  },

  commandNotFound(command) {
    const tool = command.split(' ')[0];
    return new AgentError(
      `Command not found: ${tool}`,
      `"${tool}" is not installed or not in PATH.`,
      [
        `Install it — e.g. for npm packages: npm install -g ${tool}`,
        'Check spelling: the command name may be slightly different',
        'Check PATH: echo $PATH',
      ]
    );
  },

  workingDirNotFound(dirPath) {
    return new AgentError(
      `Working directory not found: ${dirPath}`,
      'The directory specified with --dir does not exist.',
      [
        `Create it first: mkdir -p ${dirPath}`,
        'Check the path for typos',
        'Use an absolute path to avoid ambiguity',
      ]
    );
  },

  // ── Browser / AI errors ─────────────────────────────────────────────

  browserLaunchFailed(cause) {
    return new AgentError(
      'Failed to launch the browser',
      cause ? cause.message : 'Playwright could not start Chromium.',
      [
        'Run: npx playwright install chromium',
        'Check that you have enough disk space (~150 MB for Chromium)',
        'Try running without --headless first',
        'Check for conflicting Chromium processes: pkill chromium',
      ],
      cause
    );
  },

  inputNotFound() {
    return new AgentError(
      'Cannot find the AI chat input box',
      "The AI's UI may have changed or the page did not load correctly.",
      [
        'Run: forge-agent --calibrate  to auto-detect new selectors',
        'Make sure you are logged in to the AI',
        'Try refreshing the browser window manually',
        'Check your internet connection',
      ]
    );
  },

  loginRequired() {
    return new AgentError(
      'AI login required',
      'Your session has expired or you have not logged in yet.',
      [
        'Run without --headless so the browser window opens',
        'Log in to the AI in the browser window',
        'Press Enter in the terminal to continue',
        'Your session will be saved for future runs',
      ]
    );
  },

  responseTimeout(timeoutMs) {
    return new AgentError(
      `No response received after ${timeoutMs / 1000}s`,
      'The AI did not respond within the timeout period.',
      [
        `Increase timeout in config: { "RESPONSE_TIMEOUT": ${timeoutMs * 2} }`,
        'Check your internet connection',
        'The AI service may be experiencing high load — try again shortly',
        'Try starting a new chat: type "new" in interactive mode',
      ]
    );
  },

  emptyResponse() {
    return new AgentError(
      'Received an empty response from the AI',
      'The AI returned no text — the message may not have been sent.',
      [
        'Run: forge-agent --calibrate  to check selector health',
        'Increase STABLE_DELAY in config to wait longer for streaming',
        'Try starting a new chat session',
      ]
    );
  },

  // ── Tool errors ────────────────────────────────────────────────────────────

  unknownTool(name, availableTools) {
    const available = availableTools.slice(0, 5).join(', ') + '...';
    return new AgentError(
      `Unknown tool: "${name}"`,
      'The AI requested a tool that does not exist.',
      [
        `Available tools include: ${available}`,
        'This may be a hallucination — the agent will retry automatically',
      ]
    );
  },

  invalidToolArgs(toolName, paramName, expected, received) {
    return new AgentError(
      `Invalid argument for ${toolName}: "${paramName}"`,
      `Expected ${expected}, got ${typeof received}: ${JSON.stringify(received)}`,
      [
        'Check the tool documentation in the system prompt',
        'Ensure required parameters are provided with correct types',
      ]
    );
  },

  // ── Network errors ─────────────────────────────────────────────────────────

  urlFetchFailed(url, cause) {
    return new AgentError(
      `Failed to fetch URL: ${url}`,
      cause ? cause.message : 'Network request failed.',
      [
        'Check your internet connection',
        'Verify the URL is correct and accessible',
        'The site may be blocking automated requests',
        'Try a different URL or fetch the content manually',
      ],
      cause
    );
  },

  urlTimeout(url) {
    return new AgentError(
      `URL request timed out: ${url}`,
      'The server did not respond within 15 seconds.',
      [
        'Check if the URL is accessible in a browser',
        'The server may be slow or down',
        'Try again later',
      ]
    );
  },

  // ── Configuration errors ───────────────────────────────────────────────────

  configParseError(filePath, cause) {
    return new AgentError(
      `Cannot parse config file: ${filePath}`,
      cause ? cause.message : 'The file contains invalid JSON.',
      [
        'Check the JSON syntax — use a validator like jsonlint.com',
        'Common issues: trailing commas, missing quotes, wrong brackets',
        `Delete the file to reset to defaults: rm ${filePath}`,
      ],
      cause
    );
  },

  maxIterationsReached(max) {
    return new AgentError(
      `Reached maximum iterations (${max}) without completing the task`,
      'The agent took too many steps and was stopped to prevent infinite loops.',
      [
        `Increase MAX_ITERATIONS in config (current: ${max})`,
        'Break the task into smaller sub-tasks',
        'Use interactive mode and give more specific instructions',
        'Add --debug to see what the agent was doing',
      ]
    );
  },
};

// ─────────────────────────────────────────────
//  Error classifier — wraps raw Node errors
// ─────────────────────────────────────────────

/**
 * Convert a raw Node.js filesystem error into a structured AgentError.
 * Falls back to a generic AgentError if the code is not recognised.
 */
function classifyFsError(err, filePath, operation = 'access') {
  if (err instanceof AgentError) return err;

  switch (err.code) {
    case 'ENOENT':
      return operation === 'readdir' || operation === 'list'
        ? Errors.directoryNotFound(filePath)
        : Errors.fileNotFound(filePath);
    case 'EACCES':
    case 'EPERM':
      return Errors.permissionDenied(filePath, operation, err);
    case 'EISDIR':
      return Errors.pathIsDirectory(filePath);
    case 'ENOTDIR':
      return Errors.pathIsNotDirectory(filePath);
    case 'ENOSPC':
      return Errors.diskFull(filePath, err);
    default:
      return new AgentError(
        `Filesystem error during ${operation}: ${filePath}`,
        err.message,
        ['Check the path exists and you have permission to access it'],
        err
      );
  }
}

/**
 * Convert a raw execSync error into a structured AgentError.
 */
function classifyCommandError(err, command) {
  if (err instanceof AgentError) return err;

  if (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM') {
    return Errors.commandTimeout(command, err.timeout || 60_000);
  }

  const stderr = (err.stderr || '').toString().trim();
  if (stderr.includes('command not found') || stderr.includes('is not recognized')) {
    return Errors.commandNotFound(command);
  }

  const stdout = (err.stdout || '').toString().trim();
  return Errors.commandFailed(command, err.status || 1, stdout, stderr);
}

// ─────────────────────────────────────────────
//  Display helper
// ─────────────────────────────────────────────

/**
 * Print a structured error to stderr.
 * Accepts AgentError or plain Error.
 */
function displayError(err) {
  if (!err) return;
  if (err instanceof AgentError) {
    process.stderr.write(err.format());
  } else {
    process.stderr.write(
      '\n' + c('lred', '  ✗ Unexpected error: ') + err.message + '\n\n'
    );
  }
}

module.exports = {
  AgentError,
  Errors,
  classifyFsError,
  classifyCommandError,
  displayError,
};
