// src/agent.js — The core agent loop that ties everything together
'use strict';

const fs                           = require('fs');
const path                         = require('path');
const { execSync }                 = require('child_process');
const config                       = require('./config');
const logger                       = require('./logger');
const DeepSeekBrowser              = require('./browser');
const { executeTool }              = require('./tools');
const { parseResponse,
        formatToolResult }         = require('./parser');
const { ConversationManager }      = require('./prompt');
const { Errors, displayError }     = require('./errors');
const { sleep }                    = require('./retry');
const { ProgressTracker }          = require('./progress');

// ─────────────────────────────────────────────
//  Agent class
// ─────────────────────────────────────────────

class DeepSeekAgent {
  constructor(options = {}) {
    this.browser      = new DeepSeekBrowser();
    this.conversation = new ConversationManager();
    this.options      = options;
    this._running     = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Boot the browser and load DeepSeek */
  async init() {
    await this.browser.launch();
    await this.browser.newChat();
  }

  /** Shut down cleanly */
  async shutdown() {
    await this.browser.close();
  }

  /**
   * Run a task to completion.
   * Returns the final response string, or a partial summary on timeout.
   */
  async run(task) {
    this._running   = true;
    const maxIter   = config.MAX_ITERATIONS;
    const progress  = new ProgressTracker(task);

    // ── 1. Snapshot working directory ──────────────────────────────────────
    const dirListing = this._getWorkingDirListing();

    // ── 2. Build and send first message ───────────────────────────────────
    logger.header(`Task: ${task.slice(0, 80)}${task.length > 80 ? '…' : ''}`);

    const firstMsg = this.conversation.buildFirstMessage(task, dirListing);

    if (config.DEBUG) {
      logger.dim('--- First message (truncated) ---');
      logger.dim(firstMsg.slice(0, 600) + '...');
    }

    logger.info('Sending task to DeepSeek...');

    try {
      await this.browser.sendMessage(firstMsg);
    } catch (err) {
      // Timeout on very first send — nothing done yet, re-throw
      this._running = false;
      throw err;
    }

    // ── 3. Agent loop ──────────────────────────────────────────────────────
    for (let iter = 1; iter <= maxIter; iter++) {
      logger.iteration(iter, maxIter);
      logger.dim('Progress: ' + progress.getStatusLine());

      // ── Wait for response ──────────────────────────────────────────────
      let rawResponse;
      try {
        rawResponse = await this.browser.waitForResponse();
      } catch (err) {
        logger.warn(`Response failed after retries: ${err.message}`);
        progress.recordError(err.message);

        if (this._emptyStreak === undefined) this._emptyStreak = 0;
        this._emptyStreak++;

        // After 3 consecutive failures, give up and return partial result
        if (this._emptyStreak >= 3) {
          logger.warn('Too many consecutive failures — returning partial result.');
          this._running = false;
          const summary = progress.buildPartialSummary('repeated response failures');
          logger.finalOutput(summary);
          if (this.options.saveLog) await this._saveConversationLog(task, summary);
          return summary;
        }

        if (this._emptyStreak >= 2) {
          logger.warn('Starting a new chat to recover...');
          await this.browser.newChat();
          await sleep(2_000);
          this._emptyStreak = 0;
          const recovery = this.conversation.addToolResult(
            'SYSTEM',
            'Session was reset due to repeated empty responses. Please continue the task from where we left off.',
            true
          );
          await this.browser.sendMessage(recovery);
        } else {
          const nudge = this.conversation.addToolResult(
            'SYSTEM',
            'No response received. Please continue with the next step.',
            true
          );
          await this.browser.sendMessage(nudge);
        }
        continue;
      }

      // Clear streak on successful response
      this._emptyStreak = 0;
      progress.recordAiResponse(rawResponse);

      if (config.DEBUG) {
        logger.dim(`--- Raw response (${rawResponse.length} chars) ---`);
        logger.dim(rawResponse.slice(0, 400));
      }

      // Record the AI response in conversation history
      this.conversation.addAssistantMessage(rawResponse);

      // Parse the response
      const parsed = parseResponse(rawResponse);

      // ── Case 1: Tool call ──────────────────────────────────────────────
      if (parsed.type === 'tool_call') {
        logger.toolCall(parsed.name, parsed.args);
        progress.recordToolCall(parsed.name, parsed.args);

        let result;
        let isError = false;

        try {
          result  = await executeTool(parsed.name, parsed.args);
          logger.toolResult(result);
        } catch (err) {
          result  = err.message || String(err);
          isError = true;
          logger.toolResult(result, true);
        }

        progress.recordToolResult(parsed.name, result, isError);

        // Feed result back
        const feedbackMsg = this.conversation.addToolResult(parsed.name, result, isError);
        await this.browser.sendMessage(feedbackMsg);
        continue;
      }

      // ── Case 2: Parse error ────────────────────────────────────────────
      if (parsed.type === 'error') {
        logger.warn(`Parse error: ${parsed.message}`);
        progress.recordError(parsed.message);
        const recovery = this.conversation.addToolResult(
          'SYSTEM',
          `Parse error: ${parsed.message}\n\nPlease try again with valid JSON in your tool call.`,
          true
        );
        await this.browser.sendMessage(recovery);
        continue;
      }

      // ── Case 3: Final response ─────────────────────────────────────────
      if (parsed.type === 'final') {
        // Safety net: if the "final" response looks like a missed tool call
        const looksLikeToolCall = (
          /tool_call/i.test(parsed.content) ||
          /"name"\s*:\s*"[\w_]+"/.test(parsed.content) ||
          /write_file|read_file|run_command|list_directory/i.test(parsed.content.slice(0, 200))
        );

        if (looksLikeToolCall && this.conversation.turnCount <= maxIter - 2) {
          logger.warn('Response looks like a tool call but was not parsed — asking AI to retry format...');
          const retry = this.conversation.addToolResult(
            'SYSTEM',
            'Your response appeared to contain a tool call but it could not be parsed. ' +
            'Please respond with ONLY a ```tool_call code block and nothing else — no prose before or after it.',
            true
          );
          await this.browser.sendMessage(retry);
          continue;
        }

        logger.finalOutput(parsed.content);
        if (this.options.saveLog) await this._saveConversationLog(task, parsed.content);

        this._running = false;
        return parsed.content;
      }
    }

    // ── Hit max iterations — return partial result ─────────────────────────
    this._running = false;
    const summary = progress.buildPartialSummary('max_iterations');
    displayError(Errors.maxIterationsReached(maxIter));
    logger.finalOutput(summary);
    if (this.options.saveLog) await this._saveConversationLog(task, summary);
    return summary;
  }

  // ── Interactive (REPL) Mode ────────────────────────────────────────────────

  /**
   * Run the agent in interactive mode — keeps the browser open
   * and accepts tasks one after another.
   */
  async runInteractive() {
    const readline = require('readline');

    logger.header('Interactive Mode — Type your task and press Enter');
    logger.info('Commands:');
    logger.info('  "new"          — Start a fresh DeepSeek chat (clears AI context)');
    logger.info('  "exit" / "quit" — Quit the agent\n');
    logger.info('💡 Tip: Consecutive tasks in the same chat share context.');
    logger.info('        Type "new" only when you want to start a completely fresh task.\n');

    const rl = readline.createInterface({
      input    : process.stdin,
      output   : process.stdout,
      terminal : true,
    });

    const ask = () => new Promise(resolve => rl.question('\n\x1b[96m❯ Task:\x1b[0m ', resolve));
    let isFirstTask = true;

    while (true) {
      let task;
      try {
        task = (await ask()).trim();
      } catch {
        break;
      }

      if (!task) continue;

      if (['exit', 'quit', 'q'].includes(task.toLowerCase())) {
        logger.info('Exiting...');
        break;
      }

      // ── Explicit new-chat command ──────────────────────────────────────────
      if (task.toLowerCase() === 'new') {
        logger.info('Starting new chat — AI context cleared.');
        await this.browser.newChat();
        this.conversation = new ConversationManager();
        isFirstTask = true;
        continue;
      }

      // ── Run task ───────────────────────────────────────────────────────────
      // Only start a new chat on the very first task of the session.
      // Subsequent tasks CONTINUE the same chat so the AI retains context
      // about what it just built — unless the user typed "new".
      if (isFirstTask) {
        await this.browser.newChat();
        isFirstTask = false;
      }

      try {
        await this.run(task);
      } catch (err) {
        logger.error(`Task failed: ${err.message}`);
        if (config.DEBUG) console.error(err);
      }
    }

    rl.close();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _getWorkingDirListing() {
    const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build']);
    const results = [];

    function walk(dir, depth) {
      if (depth > 3 || results.length >= 80) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
      catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
        if (e.name.endsWith('.lock')) continue;
        const rel = path.relative(config.WORKING_DIR, path.join(dir, e.name));
        results.push('./' + rel.split(path.sep).join('/'));
        if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
      }
    }

    try {
      walk(config.WORKING_DIR, 0);
      return results.length > 0 ? results.sort().join('\n') : '(empty directory)';
    } catch {
      return '(could not read directory)';
    }
  }

  async _saveConversationLog(task, finalResponse) {
    try {
      const logsDir = path.join(os.homedir(), '.deepseek-agent', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const logFile  = path.join(logsDir, `session-${ts}.txt`);
      const content  = [
        `DeepSeek Agent — Session Log`,
        `Date: ${new Date().toISOString()}`,
        `Task: ${task}`,
        `Working Dir: ${config.WORKING_DIR}`,
        '═'.repeat(60),
        this.conversation.exportLog(),
        '',
        '═'.repeat(60),
        'FINAL RESPONSE:',
        finalResponse,
      ].join('\n');

      fs.writeFileSync(logFile, content, 'utf8');
      logger.dim(`Conversation saved: ${logFile}`);
    } catch (err) {
      logger.warn(`Could not save log: ${err.message}`);
    }
  }
}

// Pull os into scope for the log save helper
const os = require('os');

module.exports = DeepSeekAgent;
