'use strict';

const readline = require('readline');
const os       = require('os');

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

const PASTE_BURST_THRESHOLD_MS = 80;   // lines arriving within 80ms = paste burst
const LARGE_INPUT_THRESHOLD    = 300;  // chars — show char count above this
const MULTILINE_HINT_THRESHOLD = 100;  // chars — show "Ctrl+D to submit" hint

// ─────────────────────────────────────────────
//  InputHandler class
// ─────────────────────────────────────────────

class InputHandler {
  /**
   * @param {Object} opts
   * @param {string}   opts.prompt        — Prompt string shown to user (default: '❯ ')
   * @param {boolean}  opts.multiline     — Enable multi-line mode (default: true)
   * @param {boolean}  opts.showCharCount — Show character count for large inputs
   * @param {boolean}  opts.showHints     — Show key hints on first run
   * @param {Function} opts.onCommand     — Called for slash commands (optional)
   * @param {Object}   opts.logger        — Logger instance (optional)
   */
  constructor(opts = {}) {
    this.prompt        = opts.prompt        || '\x1b[96m❯\x1b[0m ';
    this.multiline     = opts.multiline     !== false;
    this.showCharCount = opts.showCharCount !== false;
    this.showHints     = opts.showHints     !== false;
    this.onCommand     = opts.onCommand     || null;
    this.logger        = opts.logger        || null;
    this._hintShown    = false;
    this._rl           = null;
    this.tuiActive     = opts.config ? !opts.config.NO_TUI : true;
  }

  // ─────────────────────────────────────────────
  //  Main API: collect one input from the user
  // ─────────────────────────────────────────────

  /**
   * Show prompt and collect user input.
   * Handles: single line, multi-line paste, large prompts, Ctrl+C.
   *
   * @returns {Promise<string>} — trimmed user input
   * Resolves with:
   *   - The task string (non-empty, non-slash-command)
   *   - A slash command string starting with /
   *   - The string 'exit' when user wants to quit
   * Never resolves with empty string — re-prompts if empty.
   */
  async collect() {
    return new Promise((resolve, reject) => {
      // Show hints on first use
      if (this.showHints && !this._hintShown) {
        this._printHints();
        this._hintShown = true;
      }

      this._setupReadline(resolve, reject);
    });
  }

  // ─────────────────────────────────────────────
  //  Readline setup with paste detection
  // ─────────────────────────────────────────────

  _setupReadline(resolve, reject) {
    // Close any existing interface
    if (this._rl) {
      try { this._rl.close(); } catch {}
      this._rl = null;
    }

    const isTTY = process.stdin.isTTY && process.stdout.isTTY;

    if (this.tuiActive && isTTY && !this._firstTypingIndicatorShown) {
      process.stdout.write('\x1b[90m  (type task or /command)\x1b[0m\n');
      this._firstTypingIndicatorShown = true;
    }

    const rl = readline.createInterface({
      input    : process.stdin,
      output   : process.stdout,
      terminal : isTTY,
      completer: isTTY ? this._makeCompleter() : undefined,
    });

    this._rl = rl;

    // State for paste detection
    let buffer      = [];          // accumulated lines
    let lastLineAt  = 0;           // timestamp of last received line
    let submitTimer = null;        // timer to detect end of paste
    let isResolved  = false;

    const submit = (lines) => {
      if (isResolved) return;
      isResolved = true;
      if (submitTimer) { clearTimeout(submitTimer); submitTimer = null; }
      rl.close();
      this._rl = null;

      const result = lines.join('\n').trim();

      if (!result) {
        // Empty input — re-prompt
        setImmediate(() => this._setupReadline(resolve, reject));
        return;
      }

      // For very large pastes (> 1000 chars) show a summary before submitting
      if (result.length > 1000 && lines.length > 3) {
        const lineCount = lines.length;
        const charCount = result.length;
        const preview   = result.slice(0, 80).replace(/\n/g, ' ');
        process.stdout.write(
          `\x1b[90m  📋 Large input detected: ${lineCount} lines, ${charCount} chars\x1b[0m\n` +
          `\x1b[90m  Preview: "${preview}..."\x1b[0m\n`
        );
      } else if (this.showCharCount && result.length >= LARGE_INPUT_THRESHOLD) {
        process.stdout.write(
          `\x1b[90m  ${result.length} characters\x1b[0m\n`
        );
      }

      resolve(result);
    };

    // Handle Ctrl+D (EOF) — submit what we have
    rl.on('close', () => {
      if (!isResolved && buffer.length > 0) {
        submit(buffer);
      } else if (!isResolved) {
        // Ctrl+D with empty buffer — treat as exit
        isResolved = true;
        resolve('exit');
      }
    });

    // Handle Ctrl+C
    rl.on('SIGINT', () => {
      if (!isResolved) {
        process.stdout.write('\n');
        isResolved = true;
        rl.close();
        resolve('exit');
      }
    });

    // Show the prompt
    process.stdout.write(this.prompt);

    // Process each line
    rl.on('line', (line) => {
      const cleanLine = line.replace(/\r$/, ''); // remove Windows CR
      const now = Date.now();
      const timeSinceLast = now - lastLineAt;
      const prevLastLineAt = lastLineAt;
      lastLineAt = now;

      // Is this line part of a paste burst?
      const isPasteBurst = prevLastLineAt > 0 &&
                           timeSinceLast < PASTE_BURST_THRESHOLD_MS &&
                           buffer.length > 0;

      buffer.push(cleanLine);

      if (isPasteBurst || buffer.length === 1) {
        // Either first line or mid-paste — wait to see if more arrives
        if (submitTimer) clearTimeout(submitTimer);

        submitTimer = setTimeout(() => {
          // No more lines for PASTE_BURST_THRESHOLD_MS — this is complete
          submit(buffer);
        }, PASTE_BURST_THRESHOLD_MS + 20);

      } else {
        // Lines are arriving slowly (user is typing) — immediate submit
        if (submitTimer) { clearTimeout(submitTimer); submitTimer = null; }
        submit(buffer);
      }
    });
  }

  // ─────────────────────────────────────────────
  //  Tab completer for slash commands
  // ─────────────────────────────────────────────

  _makeCompleter() {
    return (line) => {
      try {
        if (!line.startsWith('/')) return [[], line];
        const { getAllCommands } = require('./commands');
        const input = line.slice(1).toLowerCase();
        const hits  = getAllCommands()
          .flatMap(cmd => [cmd.name, ...cmd.aliases])
          .filter(name => name.startsWith(input))
          .map(name => '/' + name);
        return [hits.length ? hits : [], line];
      } catch {
        return [[], line];
      }
    };
  }

  // ─────────────────────────────────────────────
  //  Hints display
  // ─────────────────────────────────────────────

  _printHints() {
    const gray  = '\x1b[90m';
    const reset = '\x1b[0m';
    const cyan  = '\x1b[36m';
    process.stdout.write([
      '',
      `${gray}  ──────────────────────────────────────────────────────${reset}`,
      `${gray}  📋  ${cyan}Interactive Mode${gray} — type a task or slash command${reset}`,
      `${gray}  ──────────────────────────────────────────────────────${reset}`,
      `${gray}  • Paste large prompts freely — they will all be captured${reset}`,
      `${gray}  • Type ${cyan}/help${gray} for all slash commands${reset}`,
      `${gray}  • Type ${cyan}exit${gray} or press Ctrl+C to quit${reset}`,
      `${gray}  ──────────────────────────────────────────────────────${reset}`,
      '',
    ].join('\n'));
  }

  // ─────────────────────────────────────────────
  //  Cleanup
  // ─────────────────────────────────────────────

  close() {
    if (this._rl) {
      try { this._rl.close(); } catch {}
      this._rl = null;
    }
  }
}

// ─────────────────────────────────────────────
//  Interactive session loop
// ─────────────────────────────────────────────

/**
 * Run the complete interactive session loop.
 * Shows prompt, collects input, handles commands and tasks.
 *
 * @param {Object} opts
 * @param {Function} opts.onTask        — async (task: string) => void
 * @param {Function} opts.onCommand     — async (input: string) => string|null
 * @param {Function} opts.onNewChat     — async () => void
 * @param {Function} opts.onExit        — () => void
 * @param {Object}   opts.logger        — logger instance
 * @param {Object}   opts.config        — config object
 */
async function runInteractiveLoop(opts = {}) {
  const {
    onTask    = async () => {},
    onCommand = async () => null,
    onNewChat = async () => {},
    onExit    = () => {},
    logger    = console,
    config    = {},
  } = opts;

  const handler = new InputHandler({
    prompt        : '\x1b[96m❯\x1b[0m ',
    multiline     : true,
    showCharCount : true,
    showHints     : true,
    logger,
    config,
  });

  // Cleanup on process exit
  process.on('exit', () => handler.close());
  process.on('SIGTERM', () => { handler.close(); process.exit(0); });

  while (true) {
    let input;
    try {
      input = await handler.collect();
    } catch (err) {
      // Input collection failed (rare) — exit gracefully
      break;
    }

    if (!input) continue;

    const lower = input.toLowerCase().trim();

    // Exit commands
    if (['exit', 'quit', 'q'].includes(lower)) {
      onExit();
      break;
    }

    // Legacy "new" command (also handled by /new slash command)
    if (lower === 'new') {
      try {
        await onNewChat();
        if (logger.info) logger.info('New chat started.');
        else console.log('New chat started.');
      } catch (e) {
        console.log(`Failed to start new chat: ${e.message}`);
      }
      continue;
    }

    // Slash commands
    if (input.startsWith('/')) {
      try {
        const result = await onCommand(input);
        if (result) {
          if (logger.separator) logger.separator();
          process.stdout.write(result + '\n');
          if (logger.separator) logger.separator();
        }
      } catch (e) {
        console.log(`Command error: ${e.message}`);
      }
      continue;
    }

    // Normal task
    try {
      // Show preview for large inputs
      if (input.length > LARGE_INPUT_THRESHOLD) {
        const preview = input.slice(0, 100).replace(/\n/g, ' ');
        if (logger.dim) logger.dim(`  Task: "${preview}..." (${input.length} chars)`);
      }
      await onTask(input);
    } catch (e) {
      if (logger.error) logger.error(`Task failed: ${e.message}`);
      else console.error(`Task failed: ${e.message}`);
    }
  }

  handler.close();
}

module.exports = { InputHandler, runInteractiveLoop, PASTE_BURST_THRESHOLD_MS, LARGE_INPUT_THRESHOLD };
