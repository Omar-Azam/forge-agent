'use strict';

const path = require('path');
const os   = require('os');

// ─────────────────────────────────────────────
//  Command definition shape
// ─────────────────────────────────────────────
/*
{
  name: string,           — command name (without /)
  aliases: string[],      — alternative names
  description: string,    — shown in /help
  usage: string,          — shown in /help (e.g. '/model <name>')
  category: string,       — group in /help output
  requiresArg: boolean,   — if true: error when no arg given
  execute: async (ctx) => string | null
    ctx = {
      arg: string,        — everything after the command name
      args: string[],     — arg split by spaces
      config: object,     — live config object (mutations take effect)
      agent: object,      — the agent instance
      logger: object,     — logger
      history: object,    — HistoryStore instance
      memory: object,     — MemoryStore instance
    }
    Returns: string message to display (or null for no output)
}
*/

// ─────────────────────────────────────────────
//  All built-in commands
// ─────────────────────────────────────────────

const BUILT_IN_COMMANDS = [

  // ── Help ──────────────────────────────────────────────────────────────────
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show all available slash commands',
    usage: '/help [command]',
    category: 'General',
    requiresArg: false,
    execute: async ({ arg, config }) => {
      // If arg provided: show help for that specific command
      if (arg) {
        const cmd = findCommand(arg);
        if (!cmd) return `Unknown command: /${arg}\nType /help to see all commands.`;
        return [
          `/${cmd.name}`,
          `  ${cmd.description}`,
          `  Usage: ${cmd.usage}`,
          cmd.aliases.length ? `  Aliases: ${cmd.aliases.map(a => '/'+a).join(', ')}` : '',
        ].filter(Boolean).join('\n');
      }

      // Show all commands grouped by category
      const grouped = {};
      getAllCommands().forEach(cmd => {
        if (!grouped[cmd.category]) grouped[cmd.category] = [];
        grouped[cmd.category].push(cmd);
      });

      const lines = [
        '🔨 Forge Agent — Slash Commands',
        '─'.repeat(50),
      ];

      for (const [category, cmds] of Object.entries(grouped)) {
        lines.push(`\n${category}:`);
        cmds.forEach(cmd => {
          const aliases = cmd.aliases.length
            ? ` (also: ${cmd.aliases.map(a => '/'+a).join(', ')})`
            : '';
          lines.push(`  ${cmd.usage.padEnd(28)} ${cmd.description}${aliases}`);
        });
      }

      lines.push('\n─'.repeat(50));
      lines.push('Type /help <command> for detailed help on any command.');
      return lines.join('\n');
    },
  },

  // ── Status ────────────────────────────────────────────────────────────────
  {
    name: 'status',
    aliases: ['s', 'info'],
    description: 'Show current session configuration and status',
    usage: '/status',
    category: 'General',
    requiresArg: false,
    execute: async ({ config, agent }) => {
      const { getModelDisplayName } = require('./adapter-factory');
      const toolCount = Object.keys(require('./tools').TOOLS).length;

      const lines = [
        '🔨 Forge Agent — Session Status',
        '─'.repeat(50),
        `Model:          ${getModelDisplayName(config.MODEL || 'deepseek')}`,
        `Profile:        ${config.ACTIVE_PROFILE || 'default'}`,
        `Max iterations: ${config.MAX_ITERATIONS || 100}`,
        `Timeout:        ${config.RESPONSE_TIMEOUT === 0 ? 'unlimited' : ((config.RESPONSE_TIMEOUT || 600000) / 1000) + 's'}`,
        `Thinking mode:  ${config.SHOW_THINKING ? 'ON 💭' : 'off'}`,
        `Planning mode:  ${config.PLANNING_MODE ? 'ON 📋' : 'off'}`,
        `Memory:         ${config.MEMORY_ENABLED !== false ? 'enabled' : 'disabled'}`,
        `Cache:          ${config.CACHE_ENABLED !== false ? 'enabled' : 'disabled'}`,
        `TUI:            ${config.NO_TUI ? 'disabled' : 'enabled'}`,
        `Debug:          ${config.DEBUG ? 'ON' : 'off'}`,
        `Tools loaded:   ${toolCount}`,
        `Working dir:    ${config.WORKING_DIR || process.cwd()}`,
        '─'.repeat(50),
      ];

      try {
        const { getSessionOverrides } = require('./config');
        const overrides = getSessionOverrides();
        const keys = Object.keys(overrides);
        if (keys.length > 0) {
          lines.push(`Session changes (${keys.length}):`)
          keys.forEach(k => {
            lines.push(`  * ${k}: ${JSON.stringify(overrides[k])}`);
          });
          lines.push('  Use /save-config to persist these changes.');
          lines.push('─'.repeat(50));
        }
      } catch {}

      lines.push('Use /help to see all commands.');
      return lines.join('\n');
    },
  },

  // ── Save config ───────────────────────────────────────────────────────────
  {
    name: 'save-config',
    aliases: ['save-settings'],
    description: 'Save current session config changes to ~/.deepseek-agent/config.json',
    usage: '/save-config',
    category: 'Config',
    requiresArg: false,
    execute: async ({ config }) => {
      try {
        const { saveSessionOverrides, getSessionOverrides } = require('./config');
        const overrides = getSessionOverrides();
        const keys      = Object.keys(overrides);

        if (keys.length === 0) {
          return '⚠  No config changes to save this session.';
        }

        const result = saveSessionOverrides();
        if (result.saved) {
          return [
            `✅ Config saved to: ${result.path}`,
            `   Saved ${keys.length} setting(s):`,
            ...keys.map(k => `   ${k}: ${JSON.stringify(overrides[k])}`),
          ].join('\n');
        } else {
          return `❌ Failed to save: ${result.error}`;
        }
      } catch (e) {
        return `❌ Save failed: ${e.message}`;
      }
    },
  },

  // ── Reset config ──────────────────────────────────────────────────────────
  {
    name: 'reset-config',
    aliases: ['reset'],
    description: 'Reset a config key to its default value, or all keys',
    usage: '/reset-config [key|all]',
    category: 'Config',
    requiresArg: false,
    execute: async ({ arg, config }) => {
      try {
        const { resetToDefault, resetAllToDefaults, DEFAULTS } = require('./config');

        if (!arg || arg === 'all') {
          resetAllToDefaults();
          return [
            '🔄 All config reset to defaults + file values.',
            `  MAX_ITERATIONS: ${config.MAX_ITERATIONS}`,
            `  RESPONSE_TIMEOUT: ${config.RESPONSE_TIMEOUT / 1000}s`,
            `  MODEL: ${config.MODEL}`,
          ].join('\n');
        }

        const key = arg.toUpperCase().replace(/-/g, '_');
        if (!(key in DEFAULTS)) {
          return `Unknown config key: "${arg}"\nType /config to see current config.`;
        }

        resetToDefault(key);
        return `🔄 ${key} reset to default: ${JSON.stringify(DEFAULTS[key])}`;
      } catch (e) {
        return `❌ Reset failed: ${e.message}`;
      }
    },
  },

  // ── Config display ────────────────────────────────────────────────────────
  {
    name: 'config',
    aliases: ['cfg', 'settings'],
    description: 'Show all current config values or get/set a specific key',
    usage: '/config [key] [value]',
    category: 'Config',
    requiresArg: false,
    execute: async ({ arg, args, config }) => {
      try {
        const { DEFAULTS, getSessionOverrides } = require('./config');
        const overrides = getSessionOverrides();

        // No arg: show all config
        if (!arg) {
          const lines = ['⚙  Current Configuration:\n'];
          const groups = {
            'AI Model'    : ['MODEL', 'ACTIVE_PROFILE', 'SHOW_THINKING'],
            'Behaviour'   : ['MAX_ITERATIONS', 'PLANNING_MODE', 'MEMORY_ENABLED', 'CACHE_ENABLED'],
            'Timing'      : ['RESPONSE_TIMEOUT', 'STABLE_DELAY', 'TOOL_TIMEOUT'],
            'Display'     : ['NO_TUI', 'COMPACT_OUTPUT', 'DEBUG', 'OUTPUT_FORMAT'],
            'Security'    : ['STRICT_SANDBOX', 'PARAM_VALIDATION', 'AUDIT_LOG'],
          };

          for (const [group, keys] of Object.entries(groups)) {
            lines.push(`  ${group}:`);
            keys.forEach(key => {
              const val     = config[key];
              const changed = key in overrides ? ' *' : '';
              const display = key === 'RESPONSE_TIMEOUT'
                ? (val === 0 ? 'unlimited' : `${val/1000}s`)
                : JSON.stringify(val);
              lines.push(`    ${key.padEnd(28)} ${display}${changed}`);
            });
          }

          const changedCount = Object.keys(overrides).length;
          if (changedCount > 0) {
            lines.push(`\n  (* = changed this session — /save-config to persist)`);
          }

          return lines.join('\n');
        }

        // One arg: get value
        if (args.length === 1) {
          const key = arg.toUpperCase().replace(/-/g, '_');
          if (!(key in config)) return `Unknown key: "${arg}"`;
          const changed = key in overrides ? ' (changed this session)' : '';
          return `${key}: ${JSON.stringify(config[key])}${changed}`;
        }

        // Two args: set value
        if (args.length >= 2) {
          const key   = args[0].toUpperCase().replace(/-/g, '_');
          const rawVal= args.slice(1).join(' ');

          if (!(key in DEFAULTS)) {
            return `Unknown config key: "${args[0]}"\nType /config to see all keys.`;
          }

          // Parse value based on default type
          const defaultType = typeof DEFAULTS[key];
          let parsed;
          try {
            if (defaultType === 'boolean') {
              parsed = ['true','yes','1','on'].includes(rawVal.toLowerCase());
            } else if (defaultType === 'number') {
              parsed = Number(rawVal);
              if (isNaN(parsed)) throw new Error('not a number');
            } else {
              parsed = rawVal;
            }
          } catch {
            return `Invalid value for ${key}: "${rawVal}" (expected ${defaultType})`;
          }

          const old   = config[key];
          config[key] = parsed;
          return `⚙  ${key}: ${JSON.stringify(old)} → ${JSON.stringify(parsed)}`;
        }

        return 'Usage: /config [key] [value]';
      } catch (e) {
        return `❌ Config error: ${e.message}`;
      }
    },
  },

  // ── Think toggle ──────────────────────────────────────────────────────────
  {
    name       : 'think',
    aliases    : ['thinking', 'r1'],
    description: 'Toggle chain-of-thought reasoning mode on/off',
    usage      : '/think [on|off]',
    category: 'Model',
    requiresArg: false,
    execute: async ({ arg, config }) => {
      if (arg === 'on')       config.SHOW_THINKING = true;
      else if (arg === 'off') config.SHOW_THINKING = false;
      else                    config.SHOW_THINKING = !config.SHOW_THINKING;

      const state = config.SHOW_THINKING;
      return [
        `Chain-of-thought thinking: ${state ? 'ON 💭' : 'OFF'}`,
        state
          ? '  DeepSeek will reason step-by-step (takes longer, better results).'
          : '  DeepSeek will respond directly without showing reasoning.',
        '',
        '  Note: Takes effect on the next task you run.',
        '  Type /new to start a fresh conversation with this setting.',
      ].join('\n');
    },
  },

  // ── Model switch ──────────────────────────────────────────────────────────
  {
    name: 'model',
    aliases: ['m', 'switch'],
    description: 'Switch AI model for this session',
    usage: '/model <deepseek|chatgpt|gemini>',
    category: 'Model',
    requiresArg: true,
    execute: async ({ arg, config, agent, logger }) => {
      const { SUPPORTED_MODELS, getModelDisplayName } = require('./adapter-factory');
      const modelName = (arg || '').toLowerCase().trim();

      if (!SUPPORTED_MODELS.includes(modelName)) {
        return [
          `Unknown model: "${modelName}"`,
          `Available: ${SUPPORTED_MODELS.join(', ')}`,
          'Usage: /model deepseek',
        ].join('\n');
      }

      const oldModel = config.MODEL || 'deepseek';
      config.MODEL   = modelName;

      // If agent has a browser, attempt to switch adapter
      if (agent && agent.browser && agent.browser.page) {
        try {
          const { getAdapter, getModelUrl } = require('./adapter-factory');
          const newAdapter = getAdapter(modelName, agent.browser.page, config);
          agent.browser.adapter = newAdapter;
          logger.dim(`  Navigating to ${getModelUrl(modelName)}...`);
          await agent.browser.page.goto(getModelUrl(modelName), {
            waitUntil: 'domcontentloaded',
            timeout: config.BROWSER_TIMEOUT || 30000,
          });
          await agent.browser.page.waitForTimeout(2000);
        } catch (e) {
          config.MODEL = oldModel; // revert on failure
          return `❌ Failed to switch to ${modelName}: ${e.message}\nReverted to ${oldModel}.`;
        }
      }

      return `🌐 Switched to ${getModelDisplayName(modelName)}\n  Next task will use ${modelName}. Type /new to start a fresh chat.`;
    },
  },

  // ── Profile switch ────────────────────────────────────────────────────────
  {
    name: 'profile',
    aliases: ['p'],
    description: 'Switch agent profile for this session',
    usage: '/profile <default|backend|frontend|data-science|devops>',
    category: 'Model',
    requiresArg: true,
    execute: async ({ arg, config }) => {
      try {
        const { getProfile, applyProfile, SUPPORTED_PROFILES } = require('./profiles');
        const profileName = (arg || '').toLowerCase().trim();

        if (!SUPPORTED_PROFILES.includes(profileName)) {
          return [
            `Unknown profile: "${profileName}"`,
            `Available: ${SUPPORTED_PROFILES.join(', ')}`,
            'Usage: /profile backend',
          ].join('\n');
        }

        const profile = getProfile(profileName);
        applyProfile(profile, config);

        return [
          `🎭 Switched to "${profileName}" profile`,
          `  Max iterations: ${config.MAX_ITERATIONS}`,
          `  Planning mode: ${config.PLANNING_MODE ? 'ON' : 'off'}`,
          profile.systemPromptAddition
            ? '  Profile prompt will be applied to next task.'
            : '',
        ].filter(Boolean).join('\n');
      } catch (e) {
        return `❌ Failed to apply profile: ${e.message}`;
      }
    },
  },

  // ── Plan toggle ───────────────────────────────────────────────────────────
  {
    name: 'plan',
    aliases: ['planning'],
    description: 'Toggle task planning mode on/off',
    usage: '/plan [on|off]',
    category: 'Model',
    requiresArg: false,
    execute : async ({ arg, config }) => {
      if (arg === 'on')       config.PLANNING_MODE = true;
      else if (arg === 'off') config.PLANNING_MODE = false;
      else                    config.PLANNING_MODE = !config.PLANNING_MODE;

      const state = config.PLANNING_MODE ? 'ON 📋' : 'OFF';
      return [
        `Planning mode: ${state}`,
        config.PLANNING_MODE
          ? '  Agent will show a numbered execution plan before starting the next task.'
          : '  Agent will execute tasks directly without planning.',
      ].join('\n');
    },
    },

  // ── Iterations ────────────────────────────────────────────────────────────
  {
    name: 'iterations',
    aliases: ['iter', 'steps', 'max'],
    description: 'Set maximum iterations for next task',
    usage: '/iterations <number>',
    category: 'Config',
    requiresArg: true,
    execute: async ({ arg, config }) => {
      const n = parseInt(arg || '0');
      if (isNaN(n) || n < 1) {
        return `Invalid number: "${arg}"\nUsage: /iterations 200\nCurrent: ${config.MAX_ITERATIONS}`;
      }
      const old = config.MAX_ITERATIONS;
      config.MAX_ITERATIONS = n;
      return `⚙  Max iterations: ${old} → ${n}\n  Takes effect on next task.`;
    },
  },

  // ── Timeout ───────────────────────────────────────────────────────────────
  {
    name: 'timeout',
    aliases: ['t'],
    description: 'Set response timeout in seconds (0 = unlimited)',
    usage: '/timeout <seconds|0>',
    category: 'Config',
    requiresArg: true,
    execute: async ({ arg, config }) => {
      const n = parseInt(arg || '-1');
      if (isNaN(n) || n < 0) {
        const current = config.RESPONSE_TIMEOUT === 0 ? 'unlimited' : config.RESPONSE_TIMEOUT / 1000 + 's';
        return `Invalid: "${arg}"\nUsage: /timeout 300  or  /timeout 0 (unlimited)\nCurrent: ${current}`;
      }
      config.RESPONSE_TIMEOUT = n === 0 ? 0 : n * 1000;
      const display = n === 0 ? 'unlimited ⚠' : `${n}s`;
      return `⏱  Response timeout: ${display}`;
    },
  },

  // ── Clear context ─────────────────────────────────────────────────────────
  {
    name: 'clear',
    aliases: ['reset', 'c'],
    description: 'Clear AI conversation context and start fresh chat',
    usage: '/clear',
    category: 'Session',
    requiresArg: false,
    execute: async ({ agent, logger }) => {
      try {
        if (agent && agent.browser) {
          logger.dim('  Starting new chat...');
          await agent.browser.newChat();
          // Also reset conversation manager
          if (agent.conversation) {
            agent.conversation.reset ? agent.conversation.reset() : null;
          }
          return '🗑  Context cleared — fresh chat started.\n  AI has no memory of previous messages in this session.';
        }
        return '⚠  No active browser session to clear.';
      } catch (e) {
        return `❌ Failed to clear: ${e.message}`;
      }
    },
  },

  // ── New chat ──────────────────────────────────────────────────────────────
  {
    name: 'new',
    aliases: ['n'],
    description: 'Start a new AI chat (same as typing "new" in prompt)',
    usage: '/new',
    category: 'Session',
    requiresArg: false,
    execute: async ({ agent, logger }) => {
      try {
        if (agent && agent.browser) {
          await agent.browser.newChat();
          return '✨ New chat started.';
        }
        return '⚠  No active browser session.';
      } catch (e) {
        return `❌ Failed to start new chat: ${e.message}`;
      }
    },
  },

  // ── Compact / compress context ────────────────────────────────────────────
  {
    name: 'compact',
    aliases: ['compress'],
    description: 'Manually compress conversation context to free up space',
    usage: '/compact',
    category: 'Session',
    requiresArg: false,
    execute: async ({ agent }) => {
      try {
        if (agent && agent.conversation) {
          const before = agent.conversation.messages
            ? agent.conversation.messages.length : 0;
          if (agent.conversation.compress) {
            agent.conversation.compress();
            const after = agent.conversation.messages
              ? agent.conversation.messages.length : 0;
            return `🗜  Context compressed: ${before} → ${after} messages\n  Older messages summarised to save context space.`;
          }
          return '⚠  Compression not available in current conversation state.';
        }
        return '⚠  No active conversation to compress.';
      } catch (e) {
        return `❌ Compression failed: ${e.message}`;
      }
    },
  },

  // ── Memory ────────────────────────────────────────────────────────────────
  {
    name    : 'memory',
    aliases : ['mem', 'context'],
    description: 'Show or clear project memory for current directory',
    usage   : '/memory [clear|summary]',
    category: 'Session',
    requiresArg: false,
    execute : async ({ arg, config }) => {
      try {
        const { getProjectContext } = require('./project-context');
        const ctx = getProjectContext(config.WORKING_DIR || process.cwd());
        ctx.load();

        if (arg === 'clear') {
          ctx.clear();
          return '🧹 Project memory cleared for this directory.';
        }

        if (arg === 'summary') {
          return ctx.buildContextString() || 'No project context saved yet.';
        }

        return ctx.formatDisplay();
      } catch (e) {
        return `❌ Memory error: ${e.message}`;
      }
    },
  },

  // ── History ───────────────────────────────────────────────────────────────
  {
    name: 'history',
    aliases: ['hist'],
    description: 'Show recent task history for current directory',
    usage: '/history [N]',
    category: 'Session',
    requiresArg: false,
    execute: async ({ arg, config, history }) => {
      try {
        const { HistoryStore } = require('./history');
        const store = history || new HistoryStore();
        const limit = parseInt(arg || '10');
        const entries = store.getEntries({
          limit: isNaN(limit) ? 10 : limit,
          workingDir: config.WORKING_DIR || process.cwd(),
        });

        if (entries.length === 0) {
          return '📋 No task history for this directory yet.';
        }

        const lines = [`📋 Last ${entries.length} tasks in this directory:\n`];
        entries.forEach((e, i) => {
          const icon = e.status === 'completed' ? '✅' :
                       e.status === 'partial'   ? '⚠ ' :
                       e.status === 'failed'    ? '❌' : '⏱ ';
          const time = store.getRelativeTime
            ? store.getRelativeTime(e.timestamp)
            : new Date(e.timestamp).toLocaleDateString();
          lines.push(`  [${i+1}] ${icon} ${time} — ${e.taskShort || e.task?.slice(0, 60) || '(unknown)'}`);
        });
        return lines.join('\n');
      } catch (e) {
        return `❌ History error: ${e.message}`;
      }
    },
  },

  // ── Tools list ────────────────────────────────────────────────────────────
  {
    name: 'tools',
    aliases: ['tool'],
    description: 'List all available tools the agent can use',
    usage: '/tools [search]',
    category: 'Info',
    requiresArg: false,
    execute: async ({ arg }) => {
      try {
        const { TOOLS } = require('./tools');
        const allTools = Object.entries(TOOLS);

        const filtered = arg
          ? allTools.filter(([name, tool]) =>
              name.includes(arg) ||
              (tool.description || '').toLowerCase().includes(arg.toLowerCase()))
          : allTools;

        if (filtered.length === 0) {
          return `No tools matching "${arg}". Type /tools to see all.`;
        }

        // Group by category
        const categories = {
          'File':    filtered.filter(([n]) => ['read_file','write_file','append_to_file','replace_in_file','delete_file','move_file','copy_file','get_file_info','list_directory','create_directory','write_files'].includes(n)),
          'Search':  filtered.filter(([n]) => ['search_in_files','search_codebase','find_files'].includes(n)),
          'Shell':   filtered.filter(([n]) => ['run_command','start_process','stop_process','list_processes','read_process_logs'].includes(n)),
          'Git':     filtered.filter(([n]) => n.startsWith('git_')),
          'Dev':     filtered.filter(([n]) => ['run_tests','install_package','diff_files','patch_file'].includes(n)),
          'Env':     filtered.filter(([n]) => ['read_env','set_env_var','delete_env_var','list_env_files','check_env_vars'].includes(n)),
          'System':  filtered.filter(([n]) => ['take_screenshot','read_clipboard','write_clipboard'].includes(n)),
          'Other':   filtered.filter(([n]) => !['read_file','write_file','append_to_file','replace_in_file','delete_file','move_file','copy_file','get_file_info','list_directory','create_directory','write_files','search_in_files','search_codebase','find_files','run_command','start_process','stop_process','list_processes','read_process_logs','run_tests','install_package','diff_files','patch_file','read_env','set_env_var','delete_env_var','list_env_files','check_env_vars','take_screenshot','read_clipboard','write_clipboard'].includes(n) && !n.startsWith('git_')),
        };

        const lines = [`🔧 Tools (${filtered.length}/${allTools.length}):\n`];
        for (const [cat, tools] of Object.entries(categories)) {
          if (tools.length === 0) continue;
          lines.push(`  ${cat}:`);
          tools.forEach(([name, tool]) => {
            const desc = (tool.description || '').slice(0, 60);
            lines.push(`    ${name.padEnd(22)} ${desc}`);
          });
        }

        if (arg) lines.push(`\nFiltered by: "${arg}"`);
        return lines.join('\n');
      } catch (e) {
        return `❌ Error listing tools: ${e.message}`;
      }
    },
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  {
    name: 'plugins',
    aliases: ['plugin'],
    description: 'List all loaded custom plugins',
    usage: '/plugins',
    category: 'Info',
    requiresArg: false,
    execute: async ({ config }) => {
      try {
        const pluginDir = config.PLUGIN_DIR ||
          path.join(os.homedir(), '.deepseek-agent', 'tools');
        const { discoverPlugins, loadPlugin } = require('./plugin-loader');
        const files = discoverPlugins(pluginDir);

        if (files.length === 0) {
          return [
            '🔌 No custom plugins found.',
            `  Plugin directory: ${pluginDir}`,
            '  Add .js files there to extend Forge Agent.',
            '  Use: forge-agent --new-plugin my_tool',
          ].join('\n');
        }

        const lines = [`🔌 Loaded plugins (${files.length}):\n`];
        files.forEach(f => {
          const result = loadPlugin(f);
          if (result.success) {
            lines.push(`  ✅ ${result.tool.name.padEnd(20)} ${result.tool.description || ''}`);
          } else {
            lines.push(`  ❌ ${path.basename(f).padEnd(20)} ${result.error}`);
          }
        });
        return lines.join('\n');
      } catch (e) {
        return `❌ Error listing plugins: ${e.message}`;
      }
    },
  },

  // ── Debug toggle ──────────────────────────────────────────────────────────
  {
    name: 'debug',
    aliases: ['d'],
    description: 'Toggle debug mode (shows raw AI responses)',
    usage: '/debug [on|off]',
    category: 'Config',
    requiresArg: false,
    execute: async ({ arg, config }) => {
      if (arg === 'on')  config.DEBUG = true;
      else if (arg === 'off') config.DEBUG = false;
      else config.DEBUG = !config.DEBUG;
      return `🐛 Debug mode: ${config.DEBUG ? 'ON' : 'OFF'}\n  ${config.DEBUG ? 'Raw AI responses will be shown.' : 'Debug output hidden.'}`;
    },
  },

  // ── Save conversation ─────────────────────────────────────────────────────
  {
    name: 'save',
    aliases: [],
    description: 'Save current conversation to a file',
    usage: '/save [filename]',
    category: 'Session',
    requiresArg: false,
    execute: async ({ arg, agent, config }) => {
      try {
        const fs = require('fs');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = arg || `forge-session-${timestamp}.txt`;
        const filepath = path.isAbsolute(filename)
          ? filename
          : path.join(config.WORKING_DIR || process.cwd(), filename);

        if (agent && agent.conversation && agent.conversation.messages) {
          const content = agent.conversation.messages
            .map(m => `[${m.role.toUpperCase()}]\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}\n`)
            .join('\n' + '─'.repeat(40) + '\n');
          fs.writeFileSync(filepath, content, 'utf8');
          return `💾 Conversation saved to: ${filepath}`;
        }
        return '⚠  No conversation to save yet.';
      } catch (e) {
        return `❌ Save failed: ${e.message}`;
      }
    },
  },

  // ── Benchmark quick run ───────────────────────────────────────────────────
  {
    name: 'benchmark',
    aliases: ['bench'],
    description: 'Run a quick performance benchmark',
    usage: '/benchmark',
    category: 'Info',
    requiresArg: false,
    execute: async () => {
      try {
        const { BenchmarkSuite } = require('./benchmark');
        const suite = new BenchmarkSuite({ name: 'Quick', iterations: 1, warmup: false });

        // Quick 3-benchmark test
        suite.add('parse tool call', async () => {
          const { parseResponse } = require('./parser');
          parseResponse('```json\n{"name":"write_file","args":{"path":"test.js","content":"hello"}}\n```');
        }, { category: 'parser', baseline: 10 });

        suite.add('read config', async () => {
          require('./config');
        }, { category: 'config', baseline: 10 });

        suite.add('list tools', async () => {
          Object.keys(require('./tools').TOOLS).length;
        }, { category: 'tools', baseline: 10 });

        const report = await suite.run();
        return suite.formatReport ? suite.formatReport(report) :
          `Quick benchmark: ${report.passed} passed, ${report.failed} failed in ${report.totalMs}ms`;
      } catch (e) {
        return `❌ Benchmark error: ${e.message}`;
      }
    },
  },

  // ── Working directory ─────────────────────────────────────────────────────
  {
    name: 'dir',
    aliases: ['cd', 'cwd'],
    description: 'Show or change working directory',
    usage: '/dir [path]',
    category: 'Config',
    requiresArg: false,
    execute: async ({ arg, config }) => {
      if (!arg) {
        return `📂 Working directory: ${config.WORKING_DIR || process.cwd()}`;
      }

      const fs = require('fs');
      const newPath = path.resolve(arg);

      if (!fs.existsSync(newPath)) {
        return `❌ Directory not found: ${newPath}`;
      }
      if (!fs.statSync(newPath).isDirectory()) {
        return `❌ Not a directory: ${newPath}`;
      }

      config.WORKING_DIR = newPath;
      process.chdir(newPath);
      return `📂 Working directory: ${newPath}`;
    },
  },

  // ── Version ───────────────────────────────────────────────────────────────
  {
    name: 'version',
    aliases: ['v'],
    description: 'Show Forge Agent version',
    usage: '/version',
    category: 'General',
    requiresArg: false,
    execute: async () => {
      try {
        const pkg = require('../package.json');
        return `🔨 Forge Agent v${pkg.version}`;
      } catch {
        return '🔨 Forge Agent';
      }
    },
  },

];

// ─────────────────────────────────────────────
//  Custom plugin commands registry
// ─────────────────────────────────────────────

const CUSTOM_COMMANDS = new Map(); // name → command

function registerCommand(command) {
  if (!command.name || typeof command.execute !== 'function') {
    throw new Error('Command must have name and execute function');
  }
  CUSTOM_COMMANDS.set(command.name.toLowerCase(), command);
}

function getAllCommands() {
  return [
    ...BUILT_IN_COMMANDS,
    ...Array.from(CUSTOM_COMMANDS.values()),
  ];
}

function findCommand(input) {
  const name = input.toLowerCase().trim();
  // Check built-in commands
  for (const cmd of BUILT_IN_COMMANDS) {
    if (cmd.name === name || cmd.aliases.includes(name)) return cmd;
  }
  // Check custom commands
  if (CUSTOM_COMMANDS.has(name)) return CUSTOM_COMMANDS.get(name);
  return null;
}

// ─────────────────────────────────────────────
//  CommandRouter — main entry point
// ─────────────────────────────────────────────

class CommandRouter {
  constructor(ctx = {}) {
    // ctx: { config, agent, logger, history, memory }
    this.ctx = ctx;
  }

  /**
   * Check if input is a slash command.
   * Returns true if input starts with / (excluding just a single /).
   */
  isCommand(input) {
    if (!input || typeof input !== 'string') return false;
    const trimmed = input.trim();
    return trimmed.startsWith('/') && trimmed.length > 1;
  }

  /**
   * Execute a slash command.
   * Returns the result string to display, or null if not a command.
   * Never throws — always returns a string (error message) on failure.
   */
  async execute(input) {
    if (!this.isCommand(input)) return null;

    const trimmed = input.trim().slice(1); // remove leading /
    const spaceIdx = trimmed.indexOf(' ');
    const commandName = spaceIdx === -1
      ? trimmed
      : trimmed.slice(0, spaceIdx);
    const arg = spaceIdx === -1
      ? ''
      : trimmed.slice(spaceIdx + 1).trim();
    const args = arg ? arg.split(/\s+/) : [];

    const command = findCommand(commandName);

    if (!command) {
      const similar = getAllCommands()
        .filter(c => c.name.startsWith(commandName[0]))
        .slice(0, 3)
        .map(c => `/${c.name}`);
      return [
        `Unknown command: /${commandName}`,
        similar.length ? `Did you mean: ${similar.join(', ')}?` : '',
        'Type /help to see all commands.',
      ].filter(Boolean).join('\n');
    }

    if (command.requiresArg && !arg) {
      return `/${command.name} requires an argument.\nUsage: ${command.usage}`;
    }

    try {
      const result = await command.execute({
        arg,
        args,
        config: this.ctx.config || {},
        agent : this.ctx.agent  || null,
        logger: this.ctx.logger || console,
        history: this.ctx.history || null,
        memory : this.ctx.memory  || null,
      });
      return result || null;
    } catch (err) {
      return `❌ /${command.name} failed: ${err.message}`;
    }
  }
}

module.exports = {
  CommandRouter,
  registerCommand,
  getAllCommands,
  findCommand,
  BUILT_IN_COMMANDS,
};
