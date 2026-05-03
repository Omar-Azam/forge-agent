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
   * Returns the final response string.
   */
  async run(task) {
    this._running   = true;
    const maxIter   = config.MAX_ITERATIONS;

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
    await this.browser.sendMessage(firstMsg);

    // ── 3. Agent loop ──────────────────────────────────────────────────────
    for (let iter = 1; iter <= maxIter; iter++) {
      logger.iteration(iter, maxIter);

      // Wait for response from DeepSeek
      const rawResponse = await this.browser.waitForResponse();

      if (!rawResponse || rawResponse.trim().length === 0) {
        logger.warn('Empty response received — retrying...');
        await this.browser.sendMessage('Please continue. If you are waiting for input, proceed with your best judgement.');
        continue;
      }

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

        let result;
        let isError = false;

        try {
          result  = await executeTool(parsed.name, parsed.args);
          logger.toolResult(result);
        } catch (err) {
          result  = `Error: ${err.message}`;
          isError = true;
          logger.toolResult(result, true);
        }

        // Feed result back
        const feedbackMsg = this.conversation.addToolResult(parsed.name, result, isError);
        await this.browser.sendMessage(feedbackMsg);
        continue;
      }

      // ── Case 2: Parse error ────────────────────────────────────────────
      if (parsed.type === 'error') {
        logger.warn(`Parse error: ${parsed.message}`);
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
        // Safety net: if the "final" response text contains a tool_call block
        // that our parser missed (e.g. garbled by DOM), send a correction prompt.
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

        // Optionally save conversation log
        if (this.options.saveLog) {
          await this._saveConversationLog(task, parsed.content);
        }

        this._running = false;
        return parsed.content;
      }
    }

    // ── Hit max iterations ─────────────────────────────────────────────────
    this._running = false;
    const warn = `⚠ Reached maximum iterations (${maxIter}). The task may be incomplete.`;
    logger.warn(warn);
    return warn;
  }

  // ── Interactive (REPL) Mode ────────────────────────────────────────────────

  /**
   * Run the agent in interactive mode — keeps the browser open
   * and accepts tasks one after another.
   */
  async runInteractive() {
    const readline = require('readline');

    logger.header('Interactive Mode — Type your task and press Enter');
    logger.info('Commands: "exit" or "quit" to stop, "new" to start a new chat\n');

    const rl = readline.createInterface({
      input    : process.stdin,
      output   : process.stdout,
      terminal : true,
    });

    const ask = () => new Promise(resolve => rl.question('\n\x1b[96m❯ Task:\x1b[0m ', resolve));

    while (true) {
      let task;
      try {
        task = (await ask()).trim();
      } catch {
        break; // stdin closed
      }

      if (!task) continue;

      if (['exit', 'quit', 'q'].includes(task.toLowerCase())) {
        logger.info('Exiting...');
        break;
      }

      if (task.toLowerCase() === 'new') {
        logger.info('Starting new chat...');
        await this.browser.newChat();
        this.conversation = new ConversationManager();
        continue;
      }

      // Reset conversation for each new task
      this.conversation = new ConversationManager();

      try {
        await this.browser.newChat();
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
    try {
      const result = execSync(
        `find . -maxdepth 3 \\
          -not -path '*/node_modules/*' \\
          -not -path '*/.git/*' \\
          -not -path '*/dist/*' \\
          -not -path '*/.next/*' \\
          -not -path '*/build/*' \\
          -not -name '*.lock' \\
          | sort | head -80`,
        { cwd: config.WORKING_DIR, encoding: 'utf8', timeout: 5_000 }
      ).trim();
      return result || '(empty directory)';
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
