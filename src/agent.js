// src/agent.js — The core agent loop that ties everything together
'use strict';

const fs                           = require('fs');
const path                         = require('path');
const { execSync }                 = require('child_process');
const config                       = require('./config');
const logger                       = require('./logger');
const DeepSeekBrowser              = require('./browser');
const { executeTool, cache }       = require('./tools');
const { parseResponse,
        formatToolResult }         = require('./parser');
const { ConversationManager }      = require('./prompt');
const { Errors, displayError }     = require('./errors');
const { sleep }                    = require('./retry');
const { ProgressTracker }          = require('./progress');
const { MemoryStore }              = require('./memory');
const { HistoryStore }             = require('./history');
const { TemplateStore }            = require('./templates');
const { format }                   = require('./formatter');
const { CommandRouter }            = require('./commands');
const { getProfile, getProfileSystemPromptAddition, applyProfile } = require('./profiles');
const { 
  buildPlanPrompt, 
  parsePlan, 
  formatPlanForDisplay, 
  formatPlanForContext, 
  isPlanResponse 
} = require('./planner');
const { isRunningInDocker, printDockerInfo } = require('./docker');

// ─────────────────────────────────────────────
//  Agent class
// ─────────────────────────────────────────────

class DeepSeekAgent {
  constructor(options = {}) {
    this.browser      = new DeepSeekBrowser();
    this.conversation = new ConversationManager();
    this.memory       = new MemoryStore();
    this.history      = new HistoryStore();
    this.templates    = new TemplateStore();
    this.options      = options;
    this._running     = false;

    const { getProjectContext } = require('./project-context');
    this.projectContext = getProjectContext(config.WORKING_DIR || process.cwd());

    this.commandRouter = new CommandRouter({
      config : config,
      agent  : this,
      logger : logger,
      history: this.history || null,
      memory : this.memory  || null,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Boot the browser and load DeepSeek */
  async init() {
    // Load project context FIRST
    const context = await this.projectContext.getOrCreate();
    logger.dim(`  Project: ${context.projectName}`);

    if (context.techStack && context.techStack.length > 0) {
      logger.dim(`  Stack: ${context.techStack.join(', ')}`);
    }

    if (context.completedTasks && context.completedTasks.length > 0) {
      logger.dim(`  Memory: ${context.completedTasks.length} past task(s) loaded`);
    }

    await this.browser.launch();
    
    if (isRunningInDocker()) {
      printDockerInfo();
    }

    await this.browser.newChat();

    // Subscribe to config changes to update TUI status bar
    const { onConfigChange } = require('./config');
    onConfigChange(['MODEL', 'ACTIVE_PROFILE', 'PLANNING_MODE'],
      (newValue, oldValue, key) => {
        logger.updateRunContext(config);
        if (key === 'MODEL') {
          logger.dim(`  Model changed to: ${newValue}`);
        }
      }
    );
    
    const { getLoadedPluginCount } = require('./tools');
    const pluginCount = getLoadedPluginCount();
    if (pluginCount > 0) {
      logger.info(`Loaded ${pluginCount} custom plugin(s) from ${config.PLUGIN_DIR}`);
    }
  }

  /** Shut down cleanly */
  async shutdown() {
    if (this._closed) return;
    this._closed = true;
    await this.browser.close();
  }

  /**
   * Run a task to completion.
   * Returns the final response string, or a partial summary on timeout.
   */
  async run(task, templateName = null) {
    if (this.commandRouter && this.commandRouter.isCommand(task)) {
      const result = await this.commandRouter.execute(task);
      if (result) console.log('\n' + result + '\n');
      return result || '';
    }

    logger.initTUI(config);
    this._running   = true;
    const startTime = Date.now();
    const progress  = new ProgressTracker(task);

    // Track consecutive plain-text / unrecognised responses
    // so we can send a correction rather than freezing.
    let _consecutiveUnrecognised = 0;
    const MAX_CORRECTION_ATTEMPTS = 3;

    try {
      // ── 0. Inject Memory ──────────────────────────────────────────────────
      if (config.MEMORY_ENABLED) {
        try {
          this.memory.extractTechStackFromFiles(config.WORKING_DIR);
          const memContext = this.memory.buildMemoryContext(config.WORKING_DIR);
          if (memContext) this.conversation.prependMemoryContext(memContext);
        } catch (err) {
          logger.warn(`Failed to inject memory: ${err.message}`);
        }
      }

      // ── 1. Snapshot working directory ──────────────────────────────────────
      const dirListing = this._getWorkingDirListing();

      // ── 2. Build and send first message ───────────────────────────────────
      logger.header(task, {
        model  : config.MODEL    || 'deepseek',
        profile: config.ACTIVE_PROFILE || 'default',
      });

      const profileAddition = getProfileSystemPromptAddition(config.ACTIVE_PROFILE);

      if (config.PLANNING_MODE) {
        logger.info('Generating execution plan...');
        const planPrompt = buildPlanPrompt(task, dirListing);
        const firstMsg   = this.conversation.buildFirstMessage(planPrompt, null, config.ACTIVE_PROFILE, profileAddition);

        try {
          await this.browser.sendMessage(firstMsg);
          const planResponse = await this.browser.waitForResponse();

          const steps = parsePlan(planResponse);
          if (steps.length > 0) {
            process.stdout.write('\n' + formatPlanForDisplay(steps) + '\n');

            const planContext = formatPlanForContext(steps);
            this.conversation.addAssistantMessage(planResponse);
            const feedback = this.conversation.addToolResult('PLANNER', planContext, false);

            logger.info('Starting execution based on plan...');
            await this.browser.sendMessage(feedback);
          } else {
            logger.warn('Could not parse plan. Proceeding with normal execution.');
            const nudge = this.conversation.addToolResult('SYSTEM', 'Please proceed with the task normally.', false);
            await this.browser.sendMessage(nudge);
          }
        } catch (err) {
          logger.warn(`Planning failed: ${err.message}. Proceeding without plan.`);
          const recovery = this.conversation.addToolResult('SYSTEM', 'Planning failed. Please proceed with the task normally.', true);
          await this.browser.sendMessage(recovery);
        }
      } else {
        const firstMsg = this.conversation.buildFirstMessage(task, dirListing, config.ACTIVE_PROFILE, profileAddition);

        if (config.DEBUG) {
          logger.dim('--- First message (truncated) ---');
          logger.dim(firstMsg.slice(0, 600) + '...');
        }

        logger.info('Sending task to DeepSeek...');

        try {
          await this.browser.sendMessage(firstMsg);
        } catch (err) {
          this._running = false;
          throw err;
        }
      }

      // ── 3. Agent loop ──────────────────────────────────────────────────────
      let step = 1;

      while (true) {
        logger.stepLine(step, progress.elapsedMs, progress);

        // Safety circuit breaker
        if (step > 10000) {
          logger.warn('Step count exceeded 10000 — stopping to prevent runaway process');
          break;
        }

        if (config.DEBUG) {
          const stats = cache.stats();
          logger.dim(`Cache: ${stats.hits} hits, ${stats.misses} misses, ${stats.entries} entries (${stats.hitRate} hit rate)`);
        }

        // ── Wait for response ──────────────────────────────────────────────
        let rawResponse;
        try {
          rawResponse = await this.browser.waitForResponse();
        } catch (err) {
          logger.warn(`Response failed: ${err.message}`);
          progress.recordError(err.message);

          if (this._emptyStreak === undefined) this._emptyStreak = 0;
          this._emptyStreak++;

          const noRecentProgress = progress.toolCallCount <= (this._lastToolCallCountAtFailure || 0);
          if (this._emptyStreak >= (config.EMPTY_RESPONSE_THRESHOLD || 4) && noRecentProgress) {
            logger.error('Stuck in empty response loop without progress — aborting.');
            const summary = progress.buildPartialSummary('stuck in empty response loop');
            this._recordHistory(task, 'failed', startTime, progress, summary, templateName);
            if (this.options.saveLog) await this._saveConversationLog(task, summary);
            this._running = false;
            return summary;
          }
          this._lastToolCallCountAtFailure = progress.toolCallCount;

          if (this._emptyStreak >= (config.PARTIAL_RESULT_THRESHOLD || 6)) {
            logger.warn('Too many consecutive failures — returning partial result.');

            if (config.MEMORY_ENABLED) {
              try { this.memory.recordError(config.WORKING_DIR, 'Repeated response failures'); }
              catch (err) {}
            }

            this._running = false;
            const summary = progress.buildPartialSummary('repeated response failures');
            const formatted = format(summary, config.OUTPUT_FORMAT, {
              task, model: config.MODEL, profile: config.ACTIVE_PROFILE, timestamp: config.OUTPUT_TIMESTAMP
            });
            if (config.OUTPUT_FILE) this._saveToFile(config.OUTPUT_FILE, formatted);
            else logger.finalOutput(formatted);
            this._recordHistory(task, 'timeout', startTime, progress, summary, templateName);
            if (this.options.saveLog) await this._saveConversationLog(task, summary);
            return summary;
          }

          if (this._emptyStreak >= (config.EMPTY_RESPONSE_THRESHOLD || 4)) {
            logger.warn('Starting a new chat to recover...');
            await this.browser.newChat();
            await sleep(2_000);
            const doneSoFar = progress.getStatusLine();
            const recovery = this.conversation.addToolResult(
              'SYSTEM',
              `You are a coding agent. The previous chat session was reset due to connection issues. 
               Please continue with this task: "${task}"
               Current Progress: ${doneSoFar}`,
              true
            );
            await this.browser.sendMessage(recovery);
          } else {
            await sleep(2_000);
            const nudge = this.conversation.addToolResult(
              'SYSTEM',
              'No response received. Please continue with the next step.',
              true
            );
            await this.browser.sendMessage(nudge);
          }
          step++;
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
          // Reset unrecognised counter — model is behaving correctly
          _consecutiveUnrecognised = 0;

          const toolCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [parsed];
          const toolCallCount = toolCalls.length;
          if (toolCallCount > 5) {
            logger.warn('⚠ High tool call rate detected — possible loop or prompt injection');
          }
          if (toolCallCount > 10) {
            logger.warn('⚠ Extremely high tool call rate — pausing for 3 seconds...');
            await sleep(3000);
          }

          // Track consecutive identical tool calls
          const currentCall = JSON.stringify({ name: parsed.name, args: parsed.args });
          if (this._lastToolCall === currentCall) {
            this._consecutiveIdenticalCalls = (this._consecutiveIdenticalCalls || 0) + 1;
          } else {
            this._consecutiveIdenticalCalls = 1;
            this._lastToolCall = currentCall;
          }

          if (this._consecutiveIdenticalCalls >= 3) {
            logger.warn(`Identical tool call "${parsed.name}" repeated ${this._consecutiveIdenticalCalls} times — possible infinite loop`);

            if (!process.stdin.isTTY || config.NO_INTERACTIVE) {
              logger.dim('  Non-interactive mode — continuing automatically...');
              this._consecutiveIdenticalCalls = 0;
            } else {
              const choice = await this._askLoopChoice(parsed.name, this._consecutiveIdenticalCalls);

              if (choice === 'c') {
                logger.dim('  Continuing...');
                this._consecutiveIdenticalCalls = 0;
              } else if (choice === 's') {
                logger.dim('  Skipping repeated tool call — asking AI to try differently...');
                this._consecutiveIdenticalCalls = 0;
                const skipMsg = this.conversation.addToolResult(
                  'SYSTEM',
                  `The tool "${parsed.name}" has been called multiple times with similar arguments. ` +
                  `Please try a DIFFERENT approach to accomplish the task. ` +
                  `Consider using a different tool or a different strategy.`,
                  true
                );
                await this.browser.sendMessage(skipMsg);
                step++;
                continue;
              } else if (choice === 'n') {
                logger.info('Starting new task...');
                this._running = false;
                return '';
              } else {
                logger.info('Task stopped by user.');
                this._running = false;
                return '';
              }
            }
          }

          logger.toolCall(parsed.name, parsed.args);
          progress.recordToolCall(parsed.name, parsed.args);

          let result;
          let isError = false;

          try {
            result  = await executeTool(parsed.name, parsed.args);
            logger.toolResult(result, false, parsed.name);
          } catch (err) {
            result  = err.message || String(err);
            isError = true;
            logger.toolResult(result, true, parsed.name);
          }

          progress.recordToolResult(parsed.name, result, isError);

          const feedbackMsg = this.conversation.addToolResult(parsed.name, result, isError);

          const estimatedTokens = this.conversation.messages
            .reduce((sum, m) => sum + Math.ceil(
              (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).length / 4
            ), 0);
          logger.contextMeter(estimatedTokens, 80000);

          if (this.conversation.shouldCompress(config.CONTEXT_COMPRESSION_THRESHOLD)) {
            logger.dim('Compressing context...');
            this.conversation.compress({ keepRecent: config.CONTEXT_KEEP_RECENT });
          }

          await this.browser.sendMessage(feedbackMsg);
          step++;
          continue;
        }

        // ── Case 2: Parse error ────────────────────────────────────────────
        if (parsed.type === 'error') {
          _consecutiveUnrecognised = 0;
          logger.warn(`Parse error: ${parsed.message}`);
          progress.recordError(parsed.message);
          const recovery = this.conversation.addToolResult(
            'SYSTEM',
            `Parse error: ${parsed.message}\n\nPlease try again with valid JSON in your tool call.`,
            true
          );
          await this.browser.sendMessage(recovery);
          step++;
          continue;
        }

        // ── Case 3: Final / task_complete response ─────────────────────────
        // Handles both 'final' (old parser) and 'task_complete' (new parser)
        if (parsed.type === 'final' || parsed.type === 'task_complete') {
          _consecutiveUnrecognised = 0;

          const content = parsed.content || rawResponse;

          // Safety net: if the response looks like a missed tool call
          const looksLikeToolCall = (
            /tool_call/i.test(content) ||
            /"name"\s*:\s*"[\w_]+"/.test(content) ||
            /write_file|read_file|run_command|list_directory/i.test(content.slice(0, 200))
          );

          if (looksLikeToolCall) {
            logger.warn('Response looks like a tool call but was not parsed — asking AI to retry format...');
            const retry = this.conversation.addToolResult(
              'SYSTEM',
              'Your response appeared to contain a tool call but it could not be parsed. ' +
              'Please respond with ONLY a tool call block and nothing else:\n' +
              '<tool_call>\n{"tool": "TOOL_NAME", "args": {}}\n</tool_call>',
              true
            );
            await this.browser.sendMessage(retry);
            step++;
            continue;
          }

          if (logger.getTUI && typeof logger.getTUI === 'function' && logger.getTUI().noColor === false) {
            console.log('\n' + content);
            logger.finalOutput(progress, 'completed');
          } else {
            const formatted = format(content, config.OUTPUT_FORMAT, {
              task,
              model: config.MODEL,
              profile: config.ACTIVE_PROFILE,
              timestamp: config.OUTPUT_TIMESTAMP
            });
            if (config.OUTPUT_FILE) {
              this._saveToFile(config.OUTPUT_FILE, formatted);
            } else {
              logger.finalOutput(formatted);
            }
          }

          this._recordHistory(task, 'completed', startTime, progress, content, templateName);
          if (templateName) this.templates.incrementUseCount(templateName);
          if (this.options.saveLog) await this._saveConversationLog(task, content);

          try {
            const { showNudgeIfAppropriate } = require('./sponsor');
            showNudgeIfAppropriate(this.history, config, logger);
          } catch (err) {
            // Nudge failures must never crash the agent
          }

          if (config.MEMORY_ENABLED) {
            try {
              this.memory.recordCompletedTask(config.WORKING_DIR, task.slice(0, 100));
              this.memory.recordFilesCreated(config.WORKING_DIR, [...progress.filesWritten]);
            } catch (err) {
              logger.warn(`Failed to record success in memory: ${err.message}`);
            }
          }

          this._running = false;
          if (config.DEBUG) {
            const stats = cache.stats();
            logger.dim(`Final Cache Stats: ${stats.hits} hits, ${stats.misses} misses, ${stats.entries} entries (${stats.hitRate} hit rate)`);
          }
          return content;
        }

        // ── Case 4: Plain text / unrecognised type — THE BUG FIX ──────────
        //
        // This is what caused the freeze. When parsed.type is 'text' or any
        // other unrecognised value, the old code had NO handler here so
        // execution fell through to the next loop iteration which immediately
        // called waitForResponse() again without ever sending anything to
        // DeepSeek — causing an infinite silent freeze on "Step 1".
        //
        // Fix: always send a correction message so DeepSeek has something
        // to respond to. After MAX_CORRECTION_ATTEMPTS give up and treat
        // the last response as the final answer.
        //
        _consecutiveUnrecognised++;
        logger.warn(`Response was plain text, not a tool call (attempt ${_consecutiveUnrecognised}/${MAX_CORRECTION_ATTEMPTS})`);

        if (_consecutiveUnrecognised >= MAX_CORRECTION_ATTEMPTS) {
          // DeepSeek kept responding with plain text after repeated corrections.
          // Treat the last response as the final answer rather than loop forever.
          logger.warn('AI did not use tool call format after multiple attempts — treating last response as final answer.');

          const content = rawResponse;
          const formatted = format(content, config.OUTPUT_FORMAT, {
            task, model: config.MODEL, profile: config.ACTIVE_PROFILE, timestamp: config.OUTPUT_TIMESTAMP
          });
          if (config.OUTPUT_FILE) this._saveToFile(config.OUTPUT_FILE, formatted);
          else logger.finalOutput(formatted);

          this._recordHistory(task, 'completed', startTime, progress, content, templateName);
          if (this.options.saveLog) await this._saveConversationLog(task, content);
          this._running = false;
          return content;
        }

        // Send a correction so the next waitForResponse() has something to respond to.
        // Without this line the loop freezes because waitForResponse() blocks
        // waiting for a message that was never sent.
        const correctionMsg = this.conversation.addToolResult(
          'SYSTEM',
          [
            'Your last response was plain text. You must use one of these two formats:',
            '',
            '1. If you need to do something — use a tool call:',
            '<tool_call>',
            '{"tool": "TOOL_NAME", "args": {"param": "value"}}',
            '</tool_call>',
            '',
            '2. If the task is fully complete — end with exactly:',
            'TASK_COMPLETE',
            '',
            'Do not write explanations without a tool call or TASK_COMPLETE.',
          ].join('\n'),
          true
        );
        await this.browser.sendMessage(correctionMsg);
        step++;
        continue;
      }

      return '';
    } catch (err) {
      this._running = false;
      this._recordHistory(task, 'failed', startTime, progress, err.message, templateName);
      throw err;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async _generatePlan(task) {
    try {
      const { buildPlanningPrompt, parsePlan } = require('./planner');
      const planPrompt = buildPlanningPrompt(task);
      logger.dim('  📋 Generating execution plan...');
      await this.browser.sendMessage(planPrompt);
      const planResponse = await this.browser.waitForResponse();
      const plan = parsePlan(planResponse);
      return plan;
    } catch (e) {
      logger.warn('Plan generation failed: ' + e.message);
      return null;
    }
  }

  async _confirmPlan() {
    return new Promise(resolve => {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      process.stdout.write('\n  Proceed with this plan? [Y/n]: ');
      rl.once('line', line => {
        rl.close();
        const answer = line.trim().toLowerCase();
        resolve(answer === '' || answer === 'y' || answer === 'yes');
      });
    });
  }

  async _askLoopChoice(toolName, count) {
    return new Promise(resolve => {
      const readline = require('readline');
      process.stdout.write('\n');
      process.stdout.write(`  \x1b[33m⚠  "${toolName}" called ${count}x in a row — possible loop\x1b[0m\n`);
      process.stdout.write('  \x1b[90m[c] Continue anyway\x1b[0m\n');
      process.stdout.write('  \x1b[90m[s] Skip — ask AI to try differently\x1b[0m\n');
      process.stdout.write('  \x1b[90m[n] New task\x1b[0m\n');
      process.stdout.write('  \x1b[90m[q] Quit\x1b[0m\n');
      process.stdout.write('  \x1b[90m❯ \x1b[0m');

      const rl = readline.createInterface({ input: process.stdin });
      const timer = setTimeout(() => {
        process.stdout.write('\n  (auto-continuing)\n');
        rl.close();
        resolve('c');
      }, 30_000);

      rl.once('line', line => {
        clearTimeout(timer);
        rl.close();
        const choice = line.trim().toLowerCase();
        resolve(['c','s','n','q'].includes(choice) ? choice : 'c');
      });
    });
  }

  _buildProjectContextString() {
    if (!this.projectContext) return '';
    return this.projectContext.buildContextString();
  }

  _extractTaskSummary(output) {
    if (!output) return '';
    const lines = output.split('\n').filter(l => l.trim());
    return lines.slice(0, 3).join(' ').slice(0, 300);
  }

  _getWorkingDirListing() {
    const SKIP = new Set(['.git']);

    try {
      const profile = getProfile(config.ACTIVE_PROFILE);
      if (profile.ignoredPatterns) {
        profile.ignoredPatterns.forEach(p => SKIP.has(p) || SKIP.add(p));
      }
    } catch {
      ['node_modules', 'dist', '.next', 'build'].forEach(p => SKIP.add(p));
    }

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
      const os      = require('os');
      const logsDir = path.join(os.homedir(), '.deepseek-agent', 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const logFile = path.join(logsDir, `session-${ts}.txt`);
      const content = [
        `Forge Agent — Session Log`,
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

  _saveToFile(filePath, content) {
    try {
      const outPath = path.resolve(filePath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content, 'utf8');
      logger.success(`Output saved to ${filePath}`);
    } catch (err) {
      logger.warn(`Failed to save output to ${filePath}: ${err.message}`);
      logger.finalOutput(content);
    }
  }

  _recordHistory(task, status, startTime, progress, result, templateName = null) {
    try {
      this.history.addEntry({
        task,
        taskShort: task.slice(0, 80),
        workingDir: config.WORKING_DIR,
        model: config.MODEL || 'deepseek',
        profile: config.ACTIVE_PROFILE || 'default',
        status,
        durationMs: Date.now() - startTime,
        stepsCount: progress.toolCallCount,
        filesWritten: [...progress.filesWritten],
        commandsRun: progress.commandsRun.slice(0, 10),
        errorCount: progress.errorCount,
        finalOutput: (result || '').slice(0, 500),
        templateName
      });
    } catch (err) {
      // History failures must never crash the agent
    }
  }
}

const os = require('os');

module.exports = DeepSeekAgent;