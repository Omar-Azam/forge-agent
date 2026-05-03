// src/config.js — Central configuration for DeepSeek Agent
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─────────────────────────────────────────────
//  Default configuration
// ─────────────────────────────────────────────
const defaults = {
  // Browser
  DEEPSEEK_URL   : 'https://chat.deepseek.com',
  SESSION_DIR    : path.join(os.homedir(), '.deepseek-agent', 'session'),
  HEADLESS       : false,

  // Timing
  RESPONSE_TIMEOUT : 180_000,
  STABLE_DELAY     : 2_500,
  SEND_DELAY       : 400,

  // Agent
  MAX_ITERATIONS   : 40,
  WORKING_DIR      : process.cwd(),

  // Output
  MAX_OUTPUT_LENGTH : 8_000,
  DEBUG             : false,
};

// ─────────────────────────────────────────────
//  Config loading priority (highest wins):
//
//  1. ~/.deepseek-agent/config.json  — global user config
//  2. ./deepseek-agent.config.json   — per-project config
// ─────────────────────────────────────────────

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    console.warn('[deepseek-agent] Could not parse config file: ' + filePath);
  }
  return {};
}

const globalConfigPath  = path.join(os.homedir(), '.deepseek-agent', 'config.json');
const projectConfigPath = path.join(process.cwd(), 'deepseek-agent.config.json');

const config = {
  ...defaults,
  ...loadJson(globalConfigPath),   // global overrides defaults
  ...loadJson(projectConfigPath),  // project overrides global
};

// Remove comment keys from JSON files
delete config._comment;

// Resolve session dir to absolute path
if (!path.isAbsolute(config.SESSION_DIR)) {
  config.SESSION_DIR = path.resolve(process.cwd(), config.SESSION_DIR);
}

// Ensure required directories exist
fs.mkdirSync(config.SESSION_DIR, { recursive: true });
fs.mkdirSync(path.join(os.homedir(), '.deepseek-agent', 'logs'), { recursive: true });

module.exports = config;
