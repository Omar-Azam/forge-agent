#!/usr/bin/env node
// src/index.js — CLI entry point for Forge Agent
'use strict';

const path         = require('path');
const fs           = require('fs');

// Handle EPIPE errors (e.g. when piping to 'head')
process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });
process.stderr.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });

const config       = require('./config');
const logger       = require('./logger');
const { Errors, displayError } = require('./errors');

// ─────────────────────────────────────────────
//  Unified config application
// ─────────────────────────────────────────────

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
    plan        : false,
    think       : false,
    noTui       : false,
    compact     : false,
    noMemory    : false,
    noCache     : false,
    noTimeout   : false,
    clearMemory : false,
    listPlugins : false,
    listProfiles: false,
    history     : null,
    historyStats: false,
    historyClear: false,
    historySearch: null,
    resume      : null,
    rerun       : null,
    noInteractive: false,
    setup       : false,
    configPath  : false,
    watch       : false,
    watchPatterns: [],
    watchDebounce: null,
    watchMax    : null,
    watchCooldown: null,
    template    : null,
    vars        : null,
    listTemplates: false,
    templateSearch: null,
    saveTemplate: null,
    removeTemplate: null,
    showTemplate: null,
    examples: null,
    listExamples: null,
    completionBash: false,
    completionZsh: false,
    completionFish: false,
    completionInstall: false,
    format      : 'text',
    outputFile  : null,
    timestamp   : false,
    timeout: null,
    toolTimeout: null,
    cheatsheet  : false,
    man         : false,
    manInstall  : false,
    version     : false,
    help        : null,
    benchmark   : null,
    benchmarkCompare: false,
    benchmarkSave: null,
    benchmarkJson: false,
    benchmarkIterations: 3,
    diagnostics : false,
    copy        : false,
    security    : false,
    auditLog    : false,
    strictSandbox: false,
    verbose     : false,
    sponsor     : false,
    noSponsorNudge: false,
    launchAssets: null,
    testModel: null,
    };

    let i = 0;
    while (i < args.length) {
    const a = args[i];
    switch (a) {
      case '--test-model':  opts.testModel   = true;    break;
      case '-i':
      case '--interactive': opts.interactive = true;    break;
      case '--debug':       opts.debug       = true;    break;
      case '--verbose':     opts.verbose     = true;    break;
      case '--security':    opts.security    = true;    break;
      case '--audit-log':   opts.auditLog    = true;    break;
      case '--strict-sandbox': opts.strictSandbox = true; break;
      case '--sponsor':     opts.sponsor     = true;    break;
      case '--no-sponsor-nudge': opts.noSponsorNudge = true; break;
      case '--launch-assets': opts.launchAssets = true; break;
      case '--headless':    opts.headless    = true;    break;
      case '--save-log':    opts.saveLog     = true;    break;
      case '--calibrate':   opts.calibrate   = true;    break;
      case '--plan':        opts.plan        = true;    break;
      case '--think':       opts.think       = true;    break;
      case '--no-tui':      opts.noTui       = true;    break;
      case '--compact':     opts.compact     = true;    break;
      case '--no-memory':   opts.noMemory    = true;    break;
      case '--no-cache':    opts.noCache     = true;    break;
      case '--no-timeout':  opts.noTimeout   = true;    break;
      case '--clear-memory': opts.clearMemory = true;   break;
      case '--list-plugins': opts.listPlugins = true;   break;
      case '--list-profiles': opts.listProfiles = true; break;
      case '--history':     opts.history     = 20;     break;
      case '--history-stats': opts.historyStats = true; break;
      case '--history-clear': opts.historyClear = true; break;
      case '--no-interactive': opts.noInteractive = true; break;
      case '--resume':      opts.resume      = true;    break;
      case '--rerun':       opts.rerun       = true;    break;
      case '--cheatsheet':  opts.cheatsheet  = true;    break;
      case '--man':         opts.man         = true;    break;
      case '--man-install': opts.manInstall  = true;    break;
      case '--setup':
      case '--config':      opts.setup       = true;    break;
      case '--config-path': opts.configPath  = true;    break;
      case '--watch':       opts.watch       = true;    break;
      case '--timestamp':   opts.timestamp   = true;    break;
      case '--list-templates': opts.listTemplates = true; break;
      case '--profile':     opts.profile     = args[++i]; break;
      case '--custom-profile': opts.customProfile = args[++i]; break;
      case '--new-plugin':  opts.newPlugin    = args[++i]; break;
      case '--template':    opts.template    = args[++i]; break;
      case '--save-template': opts.saveTemplate = args[++i]; break;
      case '--remove-template': opts.removeTemplate = args[++i]; break;
      case '--show-template': opts.showTemplate = args[++i]; break;
      case '--examples':    opts.examples    = true;    break;
      case '--list-examples': opts.listExamples = true; break;
      case '--benchmark':   opts.benchmark   = true;    break;
      case '--benchmark-compare': opts.benchmarkCompare = true; break;
      case '--benchmark-json': opts.benchmarkJson = true; break;
      case '--diagnostics': opts.diagnostics = true;    break;
      case '--copy':        opts.copy        = true;    break;
      case '--timeout':     opts.timeout     = args[++i]; break;
      case '--tool-timeout': opts.toolTimeout = args[++i]; break;
      case '-v':
      case '--version':     opts.version     = true;    break;
      case '-h':
      case '--help':        opts.help        = true;    break;
      case '--completion-bash': opts.completionBash = true; break;
      case '--completion-zsh':  opts.completionZsh = true; break;
      case '--completion-fish': opts.completionFish = true; break;
      case '--completion-install': opts.completionInstall = true; break;
      case '-m':
      case '--model':
        opts.model = args[++i];
        break;

      case '-d':
      case '--dir':
        opts.workingDir = args[++i];
        break;

      case '-t':
      case '--task':
        opts.task = args[++i];
        break;

      default:
        if (a && a.startsWith('--history=')) {
          opts.history = parseInt(a.split('=')[1]);
        } else if (a && a.startsWith('--history-search=')) {
          opts.historySearch = a.split('=')[1];
        } else if (a && a.startsWith('--resume=')) {
          opts.resume = a.split('=')[1];
        } else if (a && a.startsWith('--rerun=')) {
          opts.rerun = a.split('=')[1];
        } else if (a && a.startsWith('--help=')) {
          opts.help = a.split('=')[1];
        } else if (a && a.startsWith('--watch-pattern=')) {
          opts.watchPatterns.push(a.split('=')[1]);
        } else if (a && a.startsWith('--watch-debounce=')) {
          opts.watchDebounce = parseInt(a.split('=')[1]);
        } else if (a && a.startsWith('--watch-max=')) {
          opts.watchMax = parseInt(a.split('=')[1]);
        } else if (a && a.startsWith('--watch-cooldown=')) {
          opts.watchCooldown = parseInt(a.split('=')[1]);
        } else if (a && a.startsWith('--template=')) {
          opts.template = a.split('=')[1];
        } else if (a && a.startsWith('--template-search=')) {
          opts.templateSearch = a.split('=')[1];
        } else if (a && a.startsWith('--examples=')) {
          opts.examples = a.split('=')[1];
        } else if (a && a.startsWith('--list-examples=')) {
          opts.listExamples = a.split('=')[1];
        } else if (a && a.startsWith('--benchmark=')) {
          opts.benchmark = a.split('=')[1];
        } else if (a && a.startsWith('--benchmark-save=')) {
          opts.benchmarkSave = a.split('=')[1];
        } else if (a && a.startsWith('--benchmark-iterations=')) {
          opts.benchmarkIterations = parseInt(a.split('=')[1]);
        } else if (a && a.startsWith('--vars=')) {
          opts.vars = a.split('=')[1];
        } else if (a && a.startsWith('--format=')) {
          opts.format = a.split('=')[1];
        } else if (a && a.startsWith('--output=')) {
          opts.outputFile = a.split('=')[1];
        } else if (a && a.startsWith('--test-model=')) {
          opts.testModel = a.split('=')[1];
        } else if (a && !a.startsWith('-')) {
          opts.task = args.slice(i).join(' ');
          i = args.length;
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
  const isTTY = process.stdout.isTTY;
  const c = (code, text) => isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
  const version = require('../package.json').version;
  
  console.log(`
${c('1;36', '╔═════════════════════════════════════════════════════════════════════╗')}
${c('1;36', '║')}  ${c('1;37', '🔨  Forge Agent v' + version + ' — Autonomous AI Coding')}                      ${c('1;36', '║')}
${c('1;36', '║')}  ${c('0;90', 'No API key needed. Drives DeepSeek or Gemini.')}                   ${c('1;36', '║')}
${c('1;36', '╚═════════════════════════════════════════════════════════════════════╝')}

${c('1;36', 'USAGE')}
  forge-agent [OPTIONS] [TASK]
  fa          [OPTIONS] [TASK]

${c('1;36', 'QUICK START')}
  forge-agent "build a REST API with Express"        ${c('0;90', '# single task')}
  forge-agent --interactive                           ${c('0;90', '# multiple tasks')}
  forge-agent --profile=backend "refactor auth"      ${c('0;90', '# use a profile')}
  forge-agent --template=add-typescript              ${c('0;90', '# use a template')}
  forge-agent --resume                               ${c('0;90', '# resume last session')}

${c('1;36', 'CORE OPTIONS')}
  -i, --interactive      Multiple tasks with shared AI context
      --dir <path>       Set working directory (default: current dir)
      --model <name>     AI model: deepseek (default) | gemini
      --profile <name>   Profile: default | backend | frontend |
                         data-science | devops
      --plan             Show execution plan before acting
      --think            Display R1 reasoning (DeepSeek only)

${c('1;36', 'MEMORY & SESSIONS')}
      --resume           Resume a previous task (interactive picker)
      --resume=last      Resume most recent task immediately
      --resume=<id>      Resume specific task by history id
      --rerun            Re-run most recent task fresh
      --history          Browse past tasks
      --history=<N>      Show last N history entries
      --history-stats    Show usage statistics
      --history-search=<term>  Search past tasks
      --no-memory        Skip memory for this run

${c('1;36', 'TEMPLATES & EXAMPLES')}
      --template=<name>  Run a saved task template
      --list-templates   List all available templates
      --examples         Show interactive example gallery
      --examples=<id>    Run specific example project
      --list-examples    List all example projects
      --save-template=<name>  Save current task as template
      --show-template=<name>  Show full template details
      --template-search=<q>   Search templates

${c('1;36', 'OUTPUT & FORMAT')}
      --format=<name>    Output format: text | markdown | json |
                         json-raw | minimal | silent
      --output=<file>    Write output to file
      --timestamp        Add timestamp to json output
      --no-tui           Plain text output (no enhanced UI)
      --compact          Compact output (less detail per step)

${c('1;36', 'WATCH MODE')}
      --watch            Watch files and re-run on changes
      --watch-pattern=<glob>   Files to watch (e.g. "src/**/*.js")
      --watch-debounce=<ms>    Delay before running (default: 1000)
      --watch-max=<N>    Max runs before stopping
      --watch-cooldown=<ms>    Min time between runs (default: 5000)

${c('1;36', 'BENCHMARKING')}
      --benchmark        Run all performance benchmarks
      --benchmark=<cat>  Run one category (parser|tools|search|truncation|memory)
      --benchmark-compare Compare current vs previous results
      --benchmark-json   Output results as JSON
      --benchmark-iterations=<N> Number of runs per benchmark (default: 3)
      --benchmark-save=<tag> Save report with custom name tag

${c('1;36', 'PERFORMANCE')} (for slow machines / slow internet)
      --timeout=<secs>        Response timeout in seconds (default: 600)
      --no-timeout            Wait forever for AI responses
      --tool-timeout=<secs>   Shell command timeout (default: 300)

${c('1;36', 'PLUGINS & PROFILES')}
      --list-plugins     List all loaded custom plugins
      --new-plugin <n>   Create a plugin stub file
      --list-profiles    List all available profiles
      --custom-profile=<file>  Load profile from JSON file

${c('1;36', 'CONFIGURATION')}
      --setup            Run the interactive setup wizard
      --config           Alias for --setup
      --config-path      Show path to active config file

${c('1;36', 'DEBUGGING')}
      --debug            Verbose output with raw AI responses
      --headless         Run browser invisibly (no window)
      --save-log         Save full conversation to disk
      --calibrate        Auto-detect browser selectors
      --test-model       Test current model selectors
      --test-model=<n>   Test: deepseek | gemini

${c('1;36', 'SHELL COMPLETIONS')}
      --completion-bash  Print bash completion script
      --completion-zsh   Print zsh completion script
      --completion-fish  Print fish completion script
      --completion-install  Auto-detect shell and show install steps

${c('1;36', 'INFO')}
      --version          Show version
      --diagnostics      Show system info for bug reports
      --diagnostics --copy Copy diagnostics as GitHub markdown
      --cheatsheet       Show quick reference card
      --man              Print man page (roff format)
      --man-install      Show man page installation steps
      --help             Show this help
      --help=<topic>     Help on a specific topic (see TOPICS below)

${c('1;36', 'TOPICS')} (forge --help=<topic>)
  getting-started       First time setup and basic usage
  profiles              Agent profiles explained
  templates             Task templates guide
  plugins               Writing custom plugins
  watch                 Watch mode guide
  performance           Tuning for slow machines
  security              Sandbox and secret masking
  models                Switching between AI models
  resume                Resuming and re-running tasks

${c('1;36', 'SUPPORT')}
      --sponsor          Show sponsorship options
      --no-sponsor-nudge Disable funding reminder this run

${c('1;36', 'LAUNCH')}
      --launch-assets    Print all launch/announcement content
      --launch-assets=<platform>  One platform: product-hunt |
                         hacker-news | twitter | linkedin | dev-to

${c('1;36', 'MORE INFO')}
  Docs:    https://github.com/Omar-Azam/forge-agent
  Config:  ~/.deepseek-agent/config.json
  Memory:  ~/.deepseek-agent/memory.json
  History: ~/.deepseek-agent/history.json
  Plugins: ~/.deepseek-agent/tools/
`);
}

// ─────────────────────────────────────────────
//  Unified config application
// ─────────────────────────────────────────────

function applyFlagsToConfig(args, config) {
  // Model
  if (args.model) {
    try {
      const { SUPPORTED_MODELS } = require('./adapter-factory');
      const model = args.model.toLowerCase();
      if (SUPPORTED_MODELS.includes(model)) {
        config.MODEL = model;
      }
    } catch (e) {}
  }

  // Profile - APPLY PROFILE FIRST so flags can override it
  if (args.profile) {
    try {
      const { getProfile, applyProfile } = require('./profiles');
      const profile = getProfile(args.profile);
      const updated = applyProfile(profile, config);
      Object.assign(config, updated);
    } catch (e) {
      logger.warn(`Could not apply profile "${args.profile}": ${e.message}`);
    }
  } else if (config.ACTIVE_PROFILE) {
    // Re-apply current profile to ensure defaults are set
    try {
      const { getProfile, applyProfile } = require('./profiles');
      const profile = getProfile(config.ACTIVE_PROFILE);
      const updated = applyProfile(profile, config);
      Object.assign(config, updated);
    } catch (e) {}
  }

  // Timeout
  if (args.noTimeout) {
    config.RESPONSE_TIMEOUT = 0;
  } else if (args.timeout) {
    config.RESPONSE_TIMEOUT = parseInt(args.timeout) * 1000;
  }

  // Tool timeout
  if (args.toolTimeout) {
    config.TOOL_TIMEOUT = parseInt(args.toolTimeout) * 1000;
  }

  // Browser
  if (args.headless !== undefined && args.headless !== false) config.HEADLESS = true;
  if (args.noTui !== undefined && args.noTui !== false) config.NO_TUI = true;
  if (args.compact !== undefined && args.compact !== false) config.COMPACT_OUTPUT = true;
  if (args.debug !== undefined && args.debug !== false) config.DEBUG = true;

  // Memory / Cache
  if (args.noMemory !== undefined && args.noMemory !== false) config.MEMORY_ENABLED = false;
  if (args.noCache !== undefined && args.noCache !== false) config.CACHE_ENABLED = false;

  // Output
  if (args.format) {
    try {
      const { SUPPORTED_FORMATS } = require('./formatter');
      if (SUPPORTED_FORMATS.includes(args.format)) {
        config.OUTPUT_FORMAT = args.format;
      }
    } catch (e) {}
  }
  if (args.outputFile) config.OUTPUT_FILE = args.outputFile;
  if (args.timestamp !== undefined && args.timestamp !== false) config.OUTPUT_TIMESTAMP = true;

  // Sponsor
  if (args.noSponsorNudge !== undefined && args.noSponsorNudge !== false) config.DISABLE_SPONSOR_NUDGE = true;

  // Planning
  if (args.plan !== undefined && args.plan !== false) config.PLANNING_MODE = true;
  if (args.think !== undefined && args.think !== false) config.SHOW_THINKING = true;

  // Security
  if (args.auditLog !== undefined && args.auditLog !== false) config.AUDIT_LOG = true;
  if (args.strictSandbox !== undefined && args.strictSandbox !== false) config.STRICT_SANDBOX = true;

  return config;
}

// ─────────────────────────────────────────────
//  Interactive Mode Entry Point
// ─────────────────────────────────────────────

async function startInteractiveMode(agent, config) {
  try {
    const { CommandRouter } = require('./commands');
    const { runInteractiveLoop } = require('./input-handler');

    const router = new CommandRouter({
      config,
      agent,
      logger,
      history: agent.history || null,
      memory : agent.memory  || null,
    });

    logger.header('Interactive Mode');
    logger.info('Working directory: ' + (config.WORKING_DIR || process.cwd()));
    logger.info('Model: ' + (config.MODEL || 'deepseek'));

    await runInteractiveLoop({
      config,
      logger,

      onTask: async (task) => {
        await agent.run(task);
      },

      onCommand: async (input) => {
        return await router.execute(input);
      },

      onNewChat: async () => {
        if (agent.browser) {
          await agent.browser.newChat();
        }
      },

      onExit: () => {
        logger.info('Goodbye!');
      },
    });
  } catch (err) {
    logger.error('Interactive mode failed: ' + err.message);
    if (config.DEBUG) console.error(err.stack);
  }
}

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // ── Shell Completions ──────────────────────────────────────────────────────
  if (args.completionBash || args.completionZsh || args.completionFish || args.completionInstall) {
    try {
      const { 
          generateBashCompletion, 
          generateZshCompletion, 
          generateFishCompletion, 
          getInstallInstructions 
      } = require('./completions');

      if (args.completionBash)    console.log(generateBashCompletion());
      else if (args.completionZsh) console.log(generateZshCompletion());
      else if (args.completionFish) console.log(generateFishCompletion());
      else if (args.completionInstall) {
        const shell = (process.env.SHELL || '').split('/').pop();
        if (['bash', 'zsh', 'fish'].includes(shell)) {
          if (shell === 'bash') console.log(generateBashCompletion());
          else if (shell === 'zsh') console.log(generateZshCompletion());
          else if (shell === 'fish') console.log(generateFishCompletion());
          console.log(getInstallInstructions(shell));
        } else {
          console.error('Could not auto-detect shell. Please specify --completion-bash, --completion-zsh, or --completion-fish');
        }
      }
    } catch (e) {
      console.error('Completion error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Version ────────────────────────────────────────────────────────────────
  if (args.version) {
    try {
      const pkg = require('../package.json');
      console.log('Forge Agent v' + pkg.version);
    } catch {
      console.log('Forge Agent');
    }
    process.exit(0);
  }

  // ── Help / Documentation ───────────────────────────────────────────────────
  if (args.help || args.cheatsheet || args.man || args.manInstall) {
    try {
      if (typeof args.help === 'string') {
        const { TOPICS } = require('./help-topics');
        const topic = args.help.toLowerCase();
        if (TOPICS[topic]) {
          console.log(TOPICS[topic]());
          process.exit(0);
        } else {
          console.error(`\x1b[31mError: Unknown help topic "${args.help}".\x1b[0m`);
          console.log(`Available topics: ${Object.keys(TOPICS).join(', ')}`);
          process.exit(1);
        }
      }

      if (args.cheatsheet) {
        console.log(`
  ${process.stdout.isTTY ? '\x1b[1;37m🔨 FORGE AGENT — QUICK REFERENCE\x1b[0m' : '🔨 FORGE AGENT — QUICK REFERENCE'}
  ${process.stdout.isTTY ? '\x1b[1;36m══════════════════════════════════════════════════════════\x1b[0m' : '══════════════════════════════════════════════════════════'}
  ${process.stdout.isTTY ? '\x1b[1;37mBASIC\x1b[0m' : 'BASIC'}
    forge-agent "task"              Run a single task
    forge-agent --interactive       Multiple tasks, shared context
    fa "task"                       Short alias

  ${process.stdout.isTTY ? '\x1b[1;37mMODELS & PROFILES\x1b[0m' : 'MODELS & PROFILES'}
    forge-agent --model=chatgpt     Use ChatGPT instead of DeepSeek
    forge-agent --profile=backend   Backend development mode

  ${process.stdout.isTTY ? '\x1b[1;37mRESUME\x1b[0m' : 'RESUME'}
    forge-agent --resume            Pick and resume a past task
    forge-agent --resume=last       Resume most recent task
    forge-agent --rerun             Re-run most recent task fresh
    forge-agent --history           Browse past tasks

  ${process.stdout.isTTY ? '\x1b[1;37mTEMPLATES\x1b[0m' : 'TEMPLATES'}
    forge-agent --template=add-jest Run a template
    forge-agent --list-templates    See all templates

  ${process.stdout.isTTY ? '\x1b[1;37mOUTPUT\x1b[0m' : 'OUTPUT'}
    forge-agent --format=json "task"      JSON output
    forge-agent --format=markdown "task"  Markdown output
    forge-agent --output=file.md "task"   Save to file

  ${process.stdout.isTTY ? '\x1b[1;37mPERFORMANCE\x1b[0m' : 'PERFORMANCE'}
    forge-agent --no-timeout "task"       No response timeout
    forge-agent --max-iterations=200      More steps allowed

  ${process.stdout.isTTY ? '\x1b[1;37mWATCH\x1b[0m' : 'WATCH'}
    forge-agent --watch "fix tests"       Re-run on file changes

  ${process.stdout.isTTY ? '\x1b[1;37mSETUP\x1b[0m' : 'SETUP'}
    forge-agent --setup             Config wizard
    forge-agent --help=getting-started    Beginner guide
    forge-agent --help=<topic>            Topic help
    forge-agent --test-model              Verify model selectors work
  ${process.stdout.isTTY ? '\x1b[1;36m══════════════════════════════════════════════════════════\x1b[0m' : '══════════════════════════════════════════════════════════'}
  Topics: getting-started profiles templates plugins
          watch performance security models resume
`);
        process.exit(0);
      }

      if (args.man || args.manInstall) {
        const { generateManPage, generateInstallInstructions } = require('./manpage');
        if (args.manInstall) {
          console.log(generateManPage());
          console.log('\n' + '='.repeat(60) + '\n');
          console.log(generateInstallInstructions());
        } else {
          process.stdout.write(generateManPage() + '\n');
        }
        process.exit(0);
      }

      printHelp();
    } catch (e) {
      console.error('Help error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Apply flags to config ──────────────────────────────────────────────────
  applyFlagsToConfig(args, config);

  // Sync logger with newly applied config
  logger.initTUI(config);

  if (args.workingDir) {
    const resolved = path.resolve(args.workingDir);
    if (!fs.existsSync(resolved)) {
      displayError(Errors.workingDirNotFound(resolved));
      process.exit(1);
    }
    config.WORKING_DIR = resolved;
  }

  // ── Clear Memory ───────────────────────────────────────────────────────────
  if (args.clearMemory) {
    try {
      const { MemoryStore } = require('./memory');
      new MemoryStore().clearProjectMemory(config.WORKING_DIR);
      logger.success(`Cleared memory for ${config.WORKING_DIR}`);
    } catch (e) {
      logger.error('Memory clear error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Profiles ───────────────────────────────────────────────────────────────
  if (args.listProfiles) {
    try {
      const { listProfiles } = require('./profiles');
      logger.header('Available Agent Profiles');
      listProfiles().forEach(p => {
        console.log(`  \x1b[36m${p.name.padEnd(14)}\x1b[0m — ${p.description}`);
      });
    } catch (e) {
      logger.error('Profile list error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.customProfile) {
    try {
      const { loadCustomProfile, applyProfile } = require('./profiles');
      const result = loadCustomProfile(args.customProfile);
      if (!result.success) {
        console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
        process.exit(1);
      }
      Object.assign(config, applyProfile(result.profile, config));
    } catch (e) {
      logger.error('Custom profile error: ' + e.message);
    }
  }

  // ── New Plugin ─────────────────────────────────────────────────────────────
  if (args.newPlugin) {
    try {
      const { createPluginStub } = require('./plugin-loader');
      const pluginPath = path.join(config.PLUGIN_DIR, `${args.newPlugin}.js`);
      fs.mkdirSync(config.PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(pluginPath, createPluginStub(args.newPlugin), 'utf8');
      logger.success(`Created plugin stub: ${pluginPath}`);
    } catch (e) {
      logger.error('Plugin creation error: ' + e.message);
    }
    process.exit(0);
  }

  // ── List Plugins ───────────────────────────────────────────────────────────
  if (args.listPlugins) {
    try {
      const { TOOLS, getLoadedPlugins } = require('./tools');
      logger.header('Loaded Custom Plugins');
      const plugins = getLoadedPlugins();
      
      if (plugins.length === 0) {
        logger.info('No custom plugins loaded.');
      } else {
        for (const name of plugins) {
            logger.info(`${name}: ${TOOLS[name].description}`);
        }
      }
    } catch (e) {
      logger.error('Plugin list error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.listTemplates || args.templateSearch || args.showTemplate) {
    try {
      const { TemplateStore } = require('./templates');
      const store = new TemplateStore();
      
      if (args.showTemplate) {
        const template = store.get(args.showTemplate);
        if (!template) {
          console.error(`\x1b[31mError: Template "${args.showTemplate}" not found.\x1b[0m`);
          process.exit(1);
        }
        logger.header(`Template: ${template.name}`);
        console.log(store.formatTemplate(template, true));
      } else {
        let templates = store.listAll();
        if (args.templateSearch) {
          templates = store.search(args.templateSearch);
          logger.header(`Template Search: "${args.templateSearch}"`);
        } else {
          logger.header('Available Templates');
        }
        console.log(store.formatList(templates));
      }
    } catch (e) {
      logger.error('Template error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.saveTemplate) {
    try {
      if (!args.task) {
        console.error('\x1b[31mError: --save-template requires a task description.\x1b[0m');
        process.exit(1);
      }
      const { TemplateStore } = require('./templates');
      const store = new TemplateStore();
      const result = store.add(args.saveTemplate, args.task, { description: 'Custom template' });
      if (!result.success) {
        console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
        process.exit(1);
      }
      logger.success(`Template "${args.saveTemplate}" saved.`);
    } catch (e) {
      logger.error('Template save error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.removeTemplate) {
    try {
      const { TemplateStore } = require('./templates');
      const store = new TemplateStore();
      const result = store.remove(args.removeTemplate);
      if (!result.removed) {
        console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
        process.exit(1);
      }
      logger.success(`Template "${args.removeTemplate}" removed.`);
    } catch (e) {
      logger.error('Template removal error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.listExamples || args.examples) {
    try {
      const { 
        getExample, 
        listExamples, 
        getCategories, 
        getDifficulties, 
        formatExampleCard, 
        formatExampleList 
      } = require('./examples');

      if (args.listExamples) {
        const filter = typeof args.listExamples === 'string' ? args.listExamples.toLowerCase() : null;
        let examples = listExamples();
        
        if (filter) {
          if (getCategories().includes(filter)) {
            examples = listExamples({ category: filter });
          } else if (getDifficulties().includes(filter)) {
            examples = listExamples({ difficulty: filter });
          }
        }
        
        logger.header(filter ? `Examples: ${filter}` : 'All Example Projects');
        examples.forEach(e => {
          console.log(`${e.id.padEnd(25)} ${e.title.padEnd(40)} (${e.category}/${e.difficulty})`);
        });
        process.exit(0);
      }

      if (args.examples) {
        if (!process.stdin.isTTY) {
          logger.warn('Non-TTY environment detected. Interactive examples disabled.');
          process.exit(0);
        }
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        
        const runExample = async (example) => {
          console.log('\n' + formatExampleCard(example));
          const answer = await new Promise(resolve => rl.question(`\nRun this example in current directory? (y/N): `, resolve));
          if (answer.toLowerCase() === 'y') {
            args.task = example.task;
            args.profile = example.profile;
            // Re-apply config with new profile
            applyFlagsToConfig(args, config);
            return true;
          }
          return false;
        };

        if (typeof args.examples === 'string') {
          const example = getExample(args.examples);
          if (!example) {
            console.error(`\x1b[31mError: Example "${args.examples}" not found.\x1b[0m`);
            rl.close();
            process.exit(1);
          }
          const confirmed = await runExample(example);
          rl.close();
          if (!confirmed) process.exit(0);
        } else {
          // Interactive mode
          let currentCategory = 'All';
          let searchTerm = null;
          
          while (true) {
            console.clear();
            console.log(`\x1b[1;36m🗂  Forge Agent — Example Projects Gallery\x1b[0m\n`);
            
            const cats = ['All', ...getCategories()];
            console.log(`Categories: ${cats.map(c => c === currentCategory ? `\x1b[1;37m[${c}]\x1b[0m` : c).join(' | ')}`);
            
            const examples = listExamples({ 
              category: currentCategory === 'All' ? null : currentCategory,
              search: searchTerm
            });
            
            console.log('\n' + formatExampleList(examples));
            console.log(`\n\x1b[90m(Type category name to filter, 's' to search, or 'q' to quit)\x1b[0m`);
            
            const input = await new Promise(resolve => rl.question(`\n\x1b[1mEnter number, category, 's', or 'q':\x1b[0m `, resolve));
            const choice = input.trim().toLowerCase();
            
            if (choice === 'q' || choice === 'cancel') {
              rl.close();
              process.exit(0);
            }
            
            if (choice === 's') {
              searchTerm = await new Promise(resolve => rl.question(`Search term: `, resolve));
              continue;
            }
            
            if (cats.map(c => c.toLowerCase()).includes(choice)) {
              currentCategory = cats.find(c => c.toLowerCase() === choice);
              searchTerm = null;
              continue;
            }
            
            const num = parseInt(choice);
            if (!isNaN(num) && num > 0 && num <= examples.length) {
              const confirmed = await runExample(examples[num - 1]);
              if (confirmed) {
                rl.close();
                break; 
              }
              continue;
            }
          }
        }
      }
    } catch (e) {
      logger.error('Examples error: ' + e.message);
      process.exit(1);
    }
  }

  // ── Template Execution ───────────────────────────────────────────────────
  let templateName = null;
  if (args.template) {
    try {
      const { TemplateStore } = require('./templates');
      const store = new TemplateStore();
      let vars = {};
      if (args.vars) {
        try { vars = JSON.parse(args.vars); }
        catch {
          console.error('\x1b[31mError: Invalid JSON in --vars.\x1b[0m');
          process.exit(1);
        }
      }
      
      const task = store.resolveTask(args.template, vars);
      if (!task) {
        console.error(`\x1b[31mError: Template "${args.template}" not found.\x1b[0m`);
        process.exit(1);
      }
      args.task = task;
      templateName = args.template;
      
      console.log(`\n\x1b[36m🔨 Running template: ${args.template}\x1b[0m`);
      console.log(`\x1b[90mTask: ${task.slice(0, 100)}...\x1b[0m\n`);
    } catch (e) {
      logger.error('Template execution error: ' + e.message);
      process.exit(1);
    }
  }

  // ── History / Resume / Rerun ──────────────────────────────────────────────
  if (args.historyStats) {
    try {
      const { HistoryStore } = require('./history');
      const store = new HistoryStore();
      logger.header('Task History Statistics');
      console.log(store.formatStats(store.getStats()));
    } catch (e) {
      logger.error('History stats error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.historyClear) {
    try {
      if (!process.stdin.isTTY) {
        logger.warn('Non-TTY environment detected. History clear requires interactive confirmation.');
        process.exit(1);
      }
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => rl.question('\x1b[33mAre you sure you want to clear all history? (y/N): \x1b[0m', resolve));
      rl.close();
      if (answer.toLowerCase() === 'y') {
        const { HistoryStore } = require('./history');
        new HistoryStore().clearHistory();
        logger.success('Task history cleared.');
      } else {
        logger.info('Clear history cancelled.');
      }
    } catch (e) {
      logger.error('History clear error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.resume || args.rerun || args.history || args.historySearch) {
    try {
      const { HistoryStore } = require('./history');
      const { 
        selectFromHistory, 
        promptResumeAction, 
      } = require('./session-resume');
      
      const store = new HistoryStore();
      let selectedEntry = null;

      if (args.resume === 'last' || args.rerun === 'last') {
        selectedEntry = store.getRecent(1)[0];
        if (!selectedEntry) {
          logger.warn('No task history found. Run a task first.');
          process.exit(0);
        }
      } else if (typeof args.resume === 'string' || typeof args.rerun === 'string') {
        const id = args.resume || args.rerun;
        selectedEntry = store.getById(id) || store.findByPartialId(id);
        if (!selectedEntry) {
          logger.error(`Task ID not found: ${id}`);
          process.exit(1);
        }
      } else if (args.history || args.historySearch || args.resume === true) {
        const entries = store.getEntries({ 
          limit: args.history || 20, 
          search: args.historySearch 
        });

        if (entries.length === 0) {
          logger.warn('No task history found.');
          process.exit(0);
        }

        if (args.historySearch) {
          logger.header(`History Search: "${args.historySearch}"`);
        } else {
          logger.header(`Last ${entries.length} History Entries`);
        }

        // Display compact list
        entries.forEach((e, i) => console.log(store.formatCompact(e, i)));

        if (!args.noInteractive && !args.historySearch) {
          if (!process.stdin.isTTY) {
            logger.warn('Non-TTY environment detected. Interactive resume disabled.');
            process.exit(0);
          }
          selectedEntry = await selectFromHistory(entries);
        } else {
          process.exit(0);
        }
      }

      if (selectedEntry) {
        // Apply working directory override if dir no longer exists
        if (selectedEntry.workingDir && !fs.existsSync(selectedEntry.workingDir)) {
          logger.warn(`⚠ Original directory not found: ${selectedEntry.workingDir}`);
          logger.warn(`   Using current directory instead: ${config.WORKING_DIR}`);
        } else if (selectedEntry.workingDir && !args.workingDir) {
          config.WORKING_DIR = selectedEntry.workingDir;
        }

        if (args.rerun) {
          logger.info(`🔄 Re-running: "${selectedEntry.task}"`);
          args.task = selectedEntry.task;
        } else {
          if (!process.stdin.isTTY) {
            logger.warn('Non-TTY environment detected. Interactive resume action disabled.');
            process.exit(0);
          }
          const { action, task, context } = await promptResumeAction(selectedEntry);
          if (action === 'cancel') process.exit(0);
          
          if (action === 'rerun') {
            logger.info(`🔄 Re-running: "${task}"`);
            args.task = task;
          } else {
            // Action is continue or modify
            args.task = task;
            args.interactive = true; // Resume always uses interactive
            args.resumeContext = {
              task: task,
              context: context,
              entry: selectedEntry
            };
          }
        }
      }
    } catch (err) {
      logger.warn(`Resume failed: ${err.message}. Falling through to normal mode.`);
    }

    // If we have a task now, we continue. If not, we might have exited or need to start fresh.
    if (!args.task && !args.interactive && !args.resume) {
       process.exit(0);
    }
  }

  // ── Benchmarking ─────────────────────────────────────────────────────────
  if (args.benchmark || args.benchmarkCompare) {
    try {
      const { 
        BenchmarkSuite, 
        formatReport, 
        saveReport, 
        loadLastReport, 
        compareReports 
      } = require('./benchmark');

      if (args.benchmarkCompare) {
        const reports = loadLastReport();
        if (!reports || !reports.current || !reports.previous) {
          console.error('\x1b[31mError: Need at least two reports to compare.\x1b[0m');
          process.exit(1);
        }
        const comparisons = compareReports(reports.current, reports.previous);

        console.log(`\n\x1b[1;36m📊 Benchmark Comparison — Current vs Previous\x1b[0m`);
        console.log(`\x1b[90m${'─'.repeat(70)}\x1b[0m`);
        console.log(`\x1b[1m${'Benchmark'.padEnd(30)} ${'Current'.padStart(10)} ${'Previous'.padStart(10)} ${'Change'.padStart(10)}\x1b[0m`);

        comparisons.forEach(c => {
          const icon = c.improved ? '\x1b[32m✅ faster\x1b[0m' : (c.changePct < -10 ? '\x1b[31m❌ slower\x1b[0m' : '\x1b[33m(slightly slower)\x1b[0m');
          const color = c.improved ? '\x1b[32m' : (c.changePct < -10 ? '\x1b[31m' : '\x1b[33m');
          const change = `${c.changePct > 0 ? '+' : ''}${c.changePct}%`;
          console.log(`${c.name.padEnd(30)} ${String(c.currentMs.toFixed(2) + 'ms').padStart(10)} ${String(c.previousMs.toFixed(2) + 'ms').padStart(10)} ${color}${change.padStart(10)}\x1b[0m ${icon}`);
        });
        console.log(`\x1b[90m${'─'.repeat(70)}\x1b[0m\n`);
        process.exit(0);
      }

      const suite = new BenchmarkSuite({ 
        iterations: args.benchmarkIterations,
        name: typeof args.benchmark === 'string' ? `${args.benchmark} performance` : 'Core Performance'
      });

      const categories = ['parser', 'tools', 'search', 'truncation', 'memory'];
      const selectedCat = typeof args.benchmark === 'string' ? args.benchmark.toLowerCase() : null;

      for (const cat of categories) {
        if (!selectedCat || selectedCat === cat) {
          try {
            const register = require(`./benchmarks/${cat}.bench`);
            register(suite);
          } catch (err) {
            if (selectedCat) {
              console.error(`\x1b[31mError: Benchmark category "${cat}" not found.\x1b[0m`);
              process.exit(1);
            }
          }
        }
      }

      if (suite.benchmarks.length === 0) {
        console.error(`\x1b[31mError: No benchmarks found matching "${args.benchmark}".\x1b[0m`);
        process.exit(1);
      }

      console.log(`\n\x1b[1;36m🚀 Running benchmarks (${suite.iterations} iterations)... \x1b[0m`);

      const report = await suite.run();

      if (args.benchmarkJson) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatReport(report));
      }

      const savedPath = saveReport(report, args.benchmarkSave);
      if (savedPath && !args.benchmarkJson) {
        console.log(`\x1b[90mReport saved to: ${savedPath}\x1b[0m\n`);
      }
    } catch (err) {
      console.error(`\x1b[31mBenchmark suite failed: ${err.message}\x1b[0m`);
      process.exit(1);
    }

    process.exit(0);
  }

  // ── Diagnostics ──────────────────────────────────────────────────────────
  if (args.diagnostics) {
    try {
      const { generateDiagnostics, formatDiagnostics, formatDiagnosticsMarkdown } = require('./diagnostics');
      const report = generateDiagnostics();

      if (args.copy) {
        const markdown = formatDiagnosticsMarkdown(report);
        console.log('\n' + markdown + '\n');

        try {
          const { writeClipboard } = require('./clipboard');
          writeClipboard(markdown);
          logger.success('Diagnostics copied to clipboard!');
        } catch (err) {
          logger.warn('Failed to copy to clipboard. Please copy the output above manually.');
        }
      } else {
        console.log('\n' + formatDiagnostics(report) + '\n');
      }
    } catch (e) {
      console.error('Diagnostics error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Security Posture ─────────────────────────────────────────────────────
  if (args.security) {
    try {
      const { generateSecurityReport, formatSecurityReport, BLOCKED_PATHS, BLOCKED_COMMANDS } = require('./security');
      const report = generateSecurityReport();
      
      if (args.verbose) {
        console.log('\n' + formatSecurityReport(report));
        console.log('\nBlocked Paths:');
        BLOCKED_PATHS.forEach(p => console.log(`  - ${p}`));
        console.log('\nBlocked Commands:');
        BLOCKED_COMMANDS.forEach(c => console.log(`  - ${c}`));
        console.log('');
      } else {
        console.log('\n' + formatSecurityReport(report) + '\n');
      }
    } catch (e) {
      console.error('Security report error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Sponsorship ──────────────────────────────────────────────────────────
  if (args.sponsor) {
    try {
      const { SponsorNudge } = require('./sponsor');
      const nudge = new SponsorNudge(null, config);
      console.log('\n' + nudge.formatSponsorPage() + '\n');
    } catch (e) {
      console.error('Sponsor error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Launch Assets ────────────────────────────────────────────────────────
  if (args.launchAssets) {
    try {
      const { generateLaunchKit, formatLaunchAsset, formatAllLaunchAssets } = require('./launch-assets');
      
      if (args.launchAssets === true) {
        console.log('\n' + formatAllLaunchAssets());
      } else {
        const kit = generateLaunchKit();
        const platform = args.launchAssets.toLowerCase();
        
        const keyMap = {
          'product-hunt': 'productHunt',
          'hacker-news' : 'hackerNews',
          'twitter'     : 'twitter',
          'linkedin'    : 'linkedin',
          'dev-to'      : 'devTo'
        };
        
        const key = keyMap[platform];
        if (key && kit[key]) {
          console.log('\n' + formatLaunchAsset(key, kit[key]));
        } else {
          console.error(`\x1b[31mError: Unknown platform "${platform}".\x1b[0m`);
          console.log('Available platforms: product-hunt, hacker-news, twitter, linkedin, dev-to');
          process.exit(1);
        }
      }
    } catch (e) {
      console.error('Launch assets error: ' + e.message);
    }
    process.exit(0);
  }

  // ── Model Selector Test ──────────────────────────────────────────────────
  if (args.testModel) {
    try {
      const modelName = typeof args.testModel === 'string' ? args.testModel : config.MODEL;
      const { getModelDisplayName, getModelUrl } = require('./adapter-factory');
      const display = getModelDisplayName(modelName);

      console.log(`\n  \x1b[1;36m🔬 Forge Agent — Model Selector Test\x1b[0m`);
      console.log(`  \x1b[90m${'─'.repeat(40)}\x1b[0m`);
      console.log(`  \x1b[1mModel:\x1b[0m     ${display}`);
      console.log(`  \x1b[1mURL:\x1b[0m       ${getModelUrl(modelName)}`);
      console.log('');

      // Force model in config for this test
      config.MODEL = modelName;
      config.HEADLESS = true; // Use headless for test
      
      const DeepSeekAgent = require('./agent');
      const agent = new DeepSeekAgent();
      
      logger.thinking('Launching browser and loading page...');
      await agent.init();
      await agent.browser.page.waitForTimeout(5000);
      
      const results = await agent.browser.adapter.testSelectors();
      logger.clearLine();

      const formatStatus = (found) => found ? '\x1b[32m✅ found\x1b[0m' : '\x1b[31m✗ not found\x1b[0m';
      
      console.log(`  Input field:    ${formatStatus(results.input)}`);
      console.log(`  Send button:    ${formatStatus(results.send)}`);
      console.log(`  Response area:  ${results.response ? '\x1b[32m✅ found\x1b[0m' : '\x1b[33m⚠  not found (ok — no messages yet)\x1b[0m'}`);
      console.log(`  New chat btn:   ${formatStatus(results.newChat)}`);
      console.log(`\n  \x1b[90m${'─'.repeat(40)}\x1b[0m`);

      if (results.ready) {
        console.log(`  \x1b[1;32mOverall: ✅ READY — model is usable\x1b[0m\n`);
        await agent.shutdown();
        process.exit(0);
      } else {
        console.log(`  \x1b[1;31mOverall: ❌ NOT READY — fix selectors before using this model\x1b[0m`);
        if (results.errors.length > 0) {
          console.log('\n  Errors:');
          results.errors.forEach(e => console.log(`    \x1b[31m✗ ${e}\x1b[0m`));
        }
        console.log('');
        await agent.shutdown();
        process.exit(1);
      }
    } catch (err) {
      logger.clearLine();
      logger.error(`Test failed: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Setup ───────────────────────────────────────────────────
  if (args.setup) {
    try {
      const { runWizard } = require('./wizard');
      await runWizard();
    } catch (e) {
      console.error('Setup error: ' + e.message);
    }
    process.exit(0);
  }

  if (args.configPath) {
    const globalConfigPath = path.join(require('os').homedir(), '.deepseek-agent', 'config.json');
    console.log(globalConfigPath);
    process.exit(0);
  }

  // ── First-time setup hint ────────────────────────────────────────────────
  const globalConfigPath = path.join(require('os').homedir(), '.deepseek-agent', 'config.json');
  if (!fs.existsSync(globalConfigPath) && !args.task && !args.interactive && !args.calibrate) {
    logger.banner();
    console.log('\n\x1b[33mWelcome to Forge Agent!\x1b[0m');
    console.log('It looks like you haven\'t configured the agent yet.');
    console.log('\nRun: \x1b[36mforge-agent --setup\x1b[0m to start the interactive configuration wizard.\n');
    process.exit(0);
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  logger.banner();
  logger.dim(`Working directory : ${config.WORKING_DIR || process.cwd()}`);
  logger.dim(`Session directory : ${config.SESSION_DIR}`);
  logger.dim(`Model             : ${config.MODEL || 'deepseek'}`);
  logger.dim(`Profile           : ${config.ACTIVE_PROFILE || 'default'}`);
  if (config.HEADLESS) logger.dim('Browser           : headless mode');
  if (config.DEBUG)    logger.dim('Debug             : ON');
  console.log('');

  // ── Create agent ───────────────────────────────────────────────────────────
  const DeepSeekAgent = require('./agent');
  const agent = new DeepSeekAgent({ saveLog: args.saveLog });

  // ── Graceful shutdown handler ──────────────────────────────────────────────
  const shutdown = async (code = 0) => {
    logger.info('\nShutting down...');
    try { await agent.shutdown(); } catch {}
    process.exit(code);
  };

  process.on('SIGINT',  () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('uncaughtException', async err => {
    displayError(err);
    if (config.DEBUG) console.error(err.stack);
    await shutdown(1);
  });
  process.on('unhandledRejection', async reason => {
    displayError(reason instanceof Error ? reason : new Error(String(reason)));
    if (config.DEBUG) console.error(reason);
    await shutdown(1);
  });

  // ── Calibrate mode ─────────────────────────────────────────────────────────
  if (args.calibrate) {
    try {
      logger.header('Calibration Mode — Reading DOM selectors');
      await agent.init();
      await agent.browser.dumpDebugInfo();
      await agent.browser.screenshot();
      logger.info('Done. Check the output above to update selectors in src/browser.js if needed.');
    } catch (e) {
      logger.error('Calibration error: ' + e.message);
    }
    await shutdown(0);
  }

  // ── Validate we have a task or interactive mode ────────────────────────────
  if (!args.interactive && !args.task) {
    logger.warn('No task provided. Switching to interactive mode...\n');
    args.interactive = true;
  }

  // ── Launch browser ─────────────────────────────────────────────────────────
  try {
    await agent.init();
  } catch (err) {
    displayError(Errors.browserLaunchFailed(err));
    if (config.DEBUG) console.error(err.stack);
    process.exit(1);
  }

  // ── Run ────────────────────────────────────────────────────────────────────
  try {
    if (args.watch) {
      if (!args.task) {
        console.error('\x1b[31mError: --watch requires a task to run on change.\x1b[0m');
        console.log('Example: forge-agent --watch "fix failing tests"');
        process.exit(1);
      }
      
      const { WatchSession } = require('./watcher');
      const session = new WatchSession({
        task: args.task,
        patterns: args.watchPatterns.length > 0 ? args.watchPatterns : ['src/**/*', '*.js', '*.ts', '*.py'],
        agent: agent,
        debounceMs: args.watchDebounce || config.WATCH_DEBOUNCE_MS,
        maxRuns: args.watchMax || config.WATCH_MAX_RUNS,
        cooldownMs: args.watchCooldown || config.WATCH_COOLDOWN_MS
      });
      
      // Cleanup on exit
      const stop = async () => {
        console.log('\nStopping watcher...');
        session.stop();
        await shutdown(0);
      };
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      
      await session.start();
      return; 
    }

    if (args.interactive) {
      await startInteractiveMode(agent, config);
    } else {
      await agent.run(args.task, templateName);
    }
  } catch (err) {
    displayError(err);
    if (config.DEBUG) console.error(err.stack);
    await shutdown(1);
  }

  await shutdown(0);
}

if (require.main === module) {
  main();
}

module.exports = { };
