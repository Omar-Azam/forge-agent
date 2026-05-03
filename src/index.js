#!/usr/bin/env node
// src/index.js — CLI entry point for DeepSeek Agent
'use strict';

const path         = require('path');
const fs           = require('fs');
const config       = require('./config');
const logger       = require('./logger');
const DeepSeekAgent = require('./agent');

// ─────────────────────────────────────────────
//  Parse CLI arguments
// ─────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    task        : null,
    interactive : false,
    debug       : false,
    headless    : false,
    saveLog     : false,
    workingDir  : null,
    calibrate   : false,
    help        : false,
  };

  let i = 0;
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case '-i':
      case '--interactive': opts.interactive = true;    break;
      case '--debug':       opts.debug       = true;    break;
      case '--headless':    opts.headless    = true;    break;
      case '--save-log':    opts.saveLog     = true;    break;
      case '--calibrate':   opts.calibrate   = true;    break;
      case '-h':
      case '--help':        opts.help        = true;    break;

      case '-d':
      case '--dir':
        opts.workingDir = args[++i];
        break;

      case '-t':
      case '--task':
        opts.task = args[++i];
        break;

      default:
        // If it doesn't start with '-', treat it as an inline task
        if (!a.startsWith('-')) {
          opts.task = args.slice(i).join(' ');
          i = args.length; // consume the rest
        }
    }
    i++;
  }

  return opts;
}

// ─────────────────────────────────────────────
//  Help text
// ─────────────────────────────────────────────

function printHelp() {
  console.log(`
\x1b[1mDEEPSEEK AGENT\x1b[0m — AI Coding Agent via Browser Automation

\x1b[33mUSAGE\x1b[0m
  node src/index.js [OPTIONS] [TASK]

\x1b[33mOPTIONS\x1b[0m
  -t, --task <task>    Task to run (can also be the last argument without a flag)
  -i, --interactive    Interactive REPL mode — keep browser open, run multiple tasks
  -d, --dir <path>     Set working directory (default: current directory)
  --debug              Verbose debug output
  --headless           Run browser in headless mode (must be logged in already)
  --save-log           Save conversation log to ~/.deepseek-agent/logs/
  --calibrate          Open browser and print DOM info to help fix selectors
  -h, --help           Show this help

\x1b[33mEXAMPLES\x1b[0m
  # Run a single task
  node src/index.js "Create a REST API in Express with CRUD for users"

  # Interactive mode (recommended)
  node src/index.js --interactive

  # Run on a specific project directory
  node src/index.js --dir ~/projects/myapp "Add TypeScript to this project"

  # Debug mode (shows raw responses)
  node src/index.js --debug "Write a binary search in Python"

  # Headless (faster, requires prior login)
  node src/index.js --headless "Refactor index.js to use async/await"

\x1b[33mFIRST-TIME SETUP\x1b[0m
  1. npm run setup         (installs deps + Playwright browser)
  2. node src/index.js -i  (opens browser, log in to DeepSeek, then use normally)
     Session is saved — you only log in once.

\x1b[33mCONFIG FILE\x1b[0m
  Create \x1b[36mdeepseek-agent.config.json\x1b[0m in your working directory to override settings:
  {
    "HEADLESS": true,
    "MAX_ITERATIONS": 50,
    "STABLE_DELAY": 3000
  }
`);
}

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  // ── Help ───────────────────────────────────────────────────────────────────
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // ── Apply options to config ────────────────────────────────────────────────
  if (opts.debug)      config.DEBUG    = true;
  if (opts.headless)   config.HEADLESS = true;
  if (opts.workingDir) {
    const resolved = path.resolve(opts.workingDir);
    if (!fs.existsSync(resolved)) {
      logger.error(`Working directory not found: ${resolved}`);
      process.exit(1);
    }
    config.WORKING_DIR = resolved;
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  logger.banner();
  logger.info(`Working directory : \x1b[36m${config.WORKING_DIR}\x1b[0m`);
  logger.info(`Session directory : \x1b[36m${config.SESSION_DIR}\x1b[0m`);
  logger.info(`Headless mode     : \x1b[36m${config.HEADLESS}\x1b[0m`);
  logger.info(`Debug mode        : \x1b[36m${config.DEBUG}\x1b[0m`);
  console.log('');

  // ── Create agent ───────────────────────────────────────────────────────────
  const agent = new DeepSeekAgent({ saveLog: opts.saveLog });

  // ── Graceful shutdown handler ──────────────────────────────────────────────
  const shutdown = async (code = 0) => {
    logger.info('\nShutting down...');
    try { await agent.shutdown(); } catch {}
    process.exit(code);
  };

  process.on('SIGINT',  () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('uncaughtException', async err => {
    logger.error(`Uncaught error: ${err.message}`);
    if (config.DEBUG) console.error(err.stack);
    await shutdown(1);
  });
  process.on('unhandledRejection', async reason => {
    logger.error(`Unhandled rejection: ${reason}`);
    if (config.DEBUG) console.error(reason);
    await shutdown(1);
  });

  // ── Calibrate mode ─────────────────────────────────────────────────────────
  if (opts.calibrate) {
    logger.header('Calibration Mode — Reading DOM selectors');
    await agent.init();
    await agent.browser.dumpDebugInfo();
    await agent.browser.screenshot();
    logger.info('Done. Check the output above to update selectors in src/browser.js if needed.');
    await shutdown(0);
  }

  // ── Validate we have a task or interactive mode ────────────────────────────
  if (!opts.interactive && !opts.task) {
    logger.warn('No task provided. Switching to interactive mode...\n');
    opts.interactive = true;
  }

  // ── Launch browser ─────────────────────────────────────────────────────────
  try {
    await agent.init();
  } catch (err) {
    logger.error(`Failed to launch browser: ${err.message}`);
    if (config.DEBUG) console.error(err.stack);
    process.exit(1);
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  try {
    if (opts.interactive) {
      await agent.runInteractive();
    } else {
      await agent.run(opts.task);
    }
  } catch (err) {
    logger.error(`Agent error: ${err.message}`);
    if (config.DEBUG) console.error(err.stack);
    await shutdown(1);
  }

  await shutdown(0);
}

main();
