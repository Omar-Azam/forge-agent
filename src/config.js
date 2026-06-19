'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─────────────────────────────────────────────
//  Default values
// ─────────────────────────────────────────────

const DEFAULTS = {
  // AI Model
  MODEL              : 'deepseek',
  DEEPSEEK_URL       : 'https://chat.deepseek.com',

  // Timing (tuned for slow connections)
  RESPONSE_TIMEOUT   : 600_000,   // 10 min total wait
  STABLE_DELAY       : 1_500,     // 1.5s of silence before response is done
  SEND_DELAY         : 600,       // 0.6s after filling input
  GENERATION_POLL    : 400,       // poll every 400ms
  APPEAR_TIMEOUT     : 20_000,    // 20s for first chars to appear
  BROWSER_TIMEOUT    : 30_000,    // 30s for page navigation
  TOOL_TIMEOUT       : 300_000,   // 5min for shell commands
  HEALTH_CHECK_TIMEOUT: 15_000,   // 15s for health checks

  // Agent behaviour
  WORKING_DIR        : process.cwd(),
  SESSION_DIR        : path.join(os.homedir(), '.deepseek-agent', 'session'),
  STRICT_SANDBOX     : false,
  MAX_OUTPUT_LENGTH  : 8_000,

  // Display
  HEADLESS           : false,
  DEBUG              : false,
  NO_TUI             : false,
  COMPACT_OUTPUT     : false,

  // Intelligence features
  PLANNING_MODE      : false,
  SHOW_THINKING      : false,
  ACTIVE_PROFILE     : 'default',
  CONTEXT_COMPRESSION_THRESHOLD: 80_000,
  CONTEXT_KEEP_RECENT: 6,
  SMART_TRUNCATION   : true,

  // Memory & Cache
  MEMORY_ENABLED     : true,
  MEMORY_FILE        : path.join(os.homedir(), '.deepseek-agent', 'memory.json'),
  CACHE_ENABLED      : true,
  CACHE_TTL_MS       : 30_000,
  CACHE_MAX_ENTRIES  : 200,

  // History
  HISTORY_ENABLED    : true,
  HISTORY_FILE       : path.join(os.homedir(), '.deepseek-agent', 'history.json'),
  HISTORY_MAX_ENTRIES: 200,

  // Plugins
  PLUGIN_DIR         : path.join(os.homedir(), '.deepseek-agent', 'tools'),

  // Templates
  TEMPLATES_FILE     : path.join(os.homedir(), '.deepseek-agent', 'templates.json'),

  // Output formatting
  OUTPUT_FORMAT      : 'text',
  OUTPUT_FILE        : null,
  OUTPUT_TIMESTAMP   : false,

  // Security
  ALLOW_DANGEROUS_COMMANDS: false,
  ALLOW_ENV_PLAIN_READ    : false,
  AUDIT_LOG               : false,
  PARAM_VALIDATION        : true,

  // Sponsorship
  DISABLE_SPONSOR_NUDGE   : false,
  SPONSOR_NUDGE_FILE      : path.join(os.homedir(), '.deepseek-agent', 'sponsor-nudge.json'),

  // Docker
  DOCKER_CONTAINER   : process.env.DOCKER_CONTAINER || '',

  // Watch mode
  WATCH_DEBOUNCE_MS  : 1_000,
  WATCH_COOLDOWN_MS  : 5_000,
  WATCH_MAX_RUNS     : 0,

  // Wizard
  WIZARD_COMPLETED   : false,

  // Response Streak Thresholds
  EMPTY_RESPONSE_THRESHOLD: 4,
  PARTIAL_RESULT_THRESHOLD: 6,
};

// ─────────────────────────────────────────────
//  Config file loading
// ─────────────────────────────────────────────

function loadJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      delete parsed._comment;
      return parsed;
    }
  } catch (e) {
    // Silent fail — bad config file just uses defaults
  }
  return {};
}

const globalConfigPath  = path.join(os.homedir(), '.deepseek-agent', 'config.json');
const projectConfigPath =
  fs.existsSync(path.join(process.cwd(), 'forge-agent.config.json'))
    ? path.join(process.cwd(), 'forge-agent.config.json')
    : path.join(process.cwd(), 'deepseek-agent.config.json'); // backward compat

const fileOverrides = {
  ...loadJsonSafe(globalConfigPath),
  ...loadJsonSafe(projectConfigPath),
};

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

function validateConfigValue(key, value) {
  const rules = {
    RESPONSE_TIMEOUT  : v => typeof v === 'number' && v >= 0,
    STABLE_DELAY      : v => typeof v === 'number' && v >= 100 && v <= 30000,
    SEND_DELAY        : v => typeof v === 'number' && v >= 100 && v <= 5000,
    GENERATION_POLL   : v => typeof v === 'number' && v >= 100 && v <= 5000,
    TOOL_TIMEOUT      : v => typeof v === 'number' && v >= 1000,
    MODEL             : v => ['deepseek','gemini'].includes(String(v).toLowerCase()),
    ACTIVE_PROFILE    : v => ['default','backend','frontend','data-science','devops'].includes(v),
    OUTPUT_FORMAT     : v => ['text','markdown','json','json-raw','minimal','silent'].includes(v),
    HEADLESS          : v => typeof v === 'boolean',
    DEBUG             : v => typeof v === 'boolean',
    NO_TUI            : v => typeof v === 'boolean',
    MEMORY_ENABLED    : v => typeof v === 'boolean',
    CACHE_ENABLED     : v => typeof v === 'boolean',
    PLANNING_MODE     : v => typeof v === 'boolean',
    SHOW_THINKING     : v => typeof v === 'boolean',
    STRICT_SANDBOX    : v => typeof v === 'boolean',
  };

  if (rules[key]) {
    return rules[key](value);
  }
  return true; // unknown keys pass through
}

// ─────────────────────────────────────────────
//  Reactive config using Proxy
// ─────────────────────────────────────────────

const _subscribers = new Map(); // key → Set<callback>
const _changeLog   = [];        // { key, oldValue, newValue, timestamp, source }
const _sessionOverrides = {};   // changes made during this session (slash commands)

const _raw = {
  ...DEFAULTS,
  ...fileOverrides,
};

// Ensure directories exist
try {
  fs.mkdirSync(path.dirname(_raw.SESSION_DIR), { recursive: true });
  fs.mkdirSync(_raw.SESSION_DIR,               { recursive: true });
  fs.mkdirSync(path.join(os.homedir(), '.deepseek-agent', 'logs'), { recursive: true });
} catch {}

// Fix non-absolute WORKING_DIR
if (_raw.WORKING_DIR && !path.isAbsolute(_raw.WORKING_DIR)) {
  _raw.WORKING_DIR = path.resolve(process.cwd(), _raw.WORKING_DIR);
}

// The Proxy intercepts all reads and writes
const config = new Proxy(_raw, {
  get(target, key) {
    return target[key];
  },

  set(target, key, value) {
    if (typeof key === 'string') {
      if (!validateConfigValue(key, value)) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`[forge-agent] Invalid value for ${key}: ${JSON.stringify(value)} — ignored`);
        }
        return true; // return true to avoid TypeError, but don't set
      }

      const oldValue = target[key];
      target[key]    = value;

      // Track session override (skip functions and internal keys added during module export)
      const isConfigKey = key in DEFAULTS || (typeof value !== 'function' && !['_raw', 'DEFAULTS'].includes(key));
      if (isConfigKey && typeof value !== 'function' && !['_raw', 'DEFAULTS'].includes(key)) {
        _sessionOverrides[key] = value;

        // Record in change log
        _changeLog.push({
          key,
          oldValue,
          newValue  : value,
          timestamp : Date.now(),
          source    : 'session',
        });
      }

      // Notify subscribers
      if (_subscribers.has(key)) {
        _subscribers.get(key).forEach(cb => {
          try { cb(value, oldValue, key); } catch {}
        });
      }
      // Notify wildcard subscribers ('*')
      if (_subscribers.has('*')) {
        _subscribers.get('*').forEach(cb => {
          try { cb(value, oldValue, key); } catch {}
        });
      }
    } else {
      target[key] = value;
    }

    return true;
  },
});

// ─────────────────────────────────────────────
//  Subscription API
// ─────────────────────────────────────────────

/**
 * Subscribe to config changes.
 * @param {string|string[]} keys — key(s) to watch, or '*' for all
 * @param {Function} callback — (newValue, oldValue, key) => void
 * @returns {Function} unsubscribe function
 */
function onConfigChange(keys, callback) {
  const keyList = keys === '*' ? ['*'] : (Array.isArray(keys) ? keys : [keys]);
  keyList.forEach(key => {
    if (!_subscribers.has(key)) _subscribers.set(key, new Set());
    _subscribers.get(key).add(callback);
  });
  return () => keyList.forEach(key => _subscribers.get(key)?.delete(callback));
}

/**
 * Apply multiple config changes at once (batched — fires subscribers once per key).
 */
function setConfig(updates) {
  Object.entries(updates).forEach(([key, value]) => {
    config[key] = value;
  });
}

/**
 * Get the session overrides (changes made since startup).
 */
function getSessionOverrides() {
  return { ..._sessionOverrides };
}

/**
 * Get the full change log for this session.
 */
function getChangeLog() {
  return [..._changeLog];
}

/**
 * Reset a key to its default value.
 */
function resetToDefault(key) {
  if (key in DEFAULTS) {
    config[key] = DEFAULTS[key];
  }
}

/**
 * Reset all session overrides to defaults/file values.
 */
function resetAllToDefaults() {
  Object.keys(_sessionOverrides).forEach(key => {
    const fileVal = fileOverrides[key];
    config[key]   = fileVal !== undefined ? fileVal : DEFAULTS[key];
  });
  // Clear overrides after reset
  for (const key in _sessionOverrides) delete _sessionOverrides[key];
}

/**
 * Save current session overrides to the global config file.
 */
function saveSessionOverrides() {
  try {
    const existing = loadJsonSafe(globalConfigPath);
    const merged   = { ...existing, ..._sessionOverrides };
    delete merged._comment;
    fs.writeFileSync(globalConfigPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    return { saved: true, path: globalConfigPath };
  } catch (e) {
    return { saved: false, error: e.message };
  }
}

// ─────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────

// The config proxy is the default export (backward compatible)
module.exports = config;

// Additional named exports for the reactive API
module.exports.onConfigChange    = onConfigChange;
module.exports.setConfig         = setConfig;
module.exports.getSessionOverrides = getSessionOverrides;
module.exports.getChangeLog      = getChangeLog;
module.exports.resetToDefault    = resetToDefault;
module.exports.resetAllToDefaults= resetAllToDefaults;
module.exports.saveSessionOverrides = saveSessionOverrides;
module.exports.DEFAULTS          = DEFAULTS;
module.exports._raw              = _raw; // for testing
