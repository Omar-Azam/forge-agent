// src/wizard.js — Interactive configuration wizard for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const config = require('./config');

const WIZARD_STEPS = [
  {
    key: 'MODEL',
    question: 'Which AI model should Forge Agent use by default?',
    type: 'choice',
    choices: ['deepseek', 'chatgpt', 'gemini'],
    default: 'deepseek',
    description: 'DeepSeek is free. ChatGPT and Gemini need you to be logged in.'
  },
  {
    key: 'ACTIVE_PROFILE',
    question: 'Which agent profile suits your work best?',
    type: 'choice',
    choices: ['default', 'backend', 'frontend', 'data-science', 'devops'],
    default: 'default',
    description: 'Profiles pre-configure the AI behaviour for specific roles.'
  },
  {
    key: 'PLANNING_MODE',
    question: 'Show a plan before executing each task?',
    type: 'boolean',
    default: false,
    description: 'When on, the AI produces a numbered plan before any tool calls.'
  },
  {
    key: 'MEMORY_ENABLED',
    question: 'Enable persistent project memory across sessions?',
    type: 'boolean',
    default: true,
    description: 'Remembers your tech stack and completed tasks between runs.'
  },
  {
    key: 'CACHE_ENABLED',
    question: 'Enable in-session tool result caching?',
    type: 'boolean',
    default: true,
    description: 'Skips repeated identical read-only tool calls for faster runs.'
  },
  {
    key: 'HEADLESS',
    question: 'Run the browser invisibly (no window)?',
    type: 'boolean',
    default: false,
    description: 'Headless is faster but harder to debug. Leave off for now.'
  },
  {
    key: 'RESPONSE_TIMEOUT',
    question: 'Max seconds to wait for AI response? (30–600)',
    type: 'number',
    default: 180,
    validate: (v) => (v >= 30 && v <= 600) ? true : 'Must be between 30 and 600 seconds',
    description: 'Increase if your internet is slow or tasks are very complex.'
  },
  {
    key: 'STRICT_SANDBOX',
    question: 'Block all file access outside the working directory?',
    type: 'boolean',
    default: false,
    description: 'Strict sandbox prevents reading files outside your project folder.'
  },
  {
    key: 'NO_TUI',
    question: 'Use plain text output instead of the enhanced terminal UI?',
    type: 'boolean',
    default: false,
    description: 'Plain output works better in CI, pipes, and minimal terminals.'
  }
];

class Wizard {
  constructor(configPath = path.join(os.homedir(), '.deepseek-agent', 'config.json')) {
    this.configPath = configPath;
    this.rl = null;
  }

  async run() {
    console.log('\n\x1b[1m🔨 Forge Agent — Setup Wizard\x1b[0m');
    console.log('\x1b[90m─────────────────────────────\x1b[0m');
    console.log('This wizard will create your configuration file.');
    console.log('Press Enter to accept the default value shown in [brackets].\n');

    if (!process.stdin.isTTY) {
      console.log('Non-TTY environment detected. Using defaults.');
      const finalConfig = this.formatConfigForFile(
        WIZARD_STEPS.reduce((acc, s) => ({ ...acc, [s.key]: s.default }), {})
      );
      return { saved: this.writeConfig(finalConfig).success, config: finalConfig };
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const existingConfig = this.readExistingConfig();
    const answers = {};

    try {
      for (let i = 0; i < WIZARD_STEPS.length; i++) {
        const step = WIZARD_STEPS[i];
        const currentVal = existingConfig[step.key] !== undefined ? existingConfig[step.key] : step.default;
        
        // Handle RESPONSE_TIMEOUT which is stored in ms but asked in seconds
        let displayVal = currentVal;
        if (step.key === 'RESPONSE_TIMEOUT' && typeof currentVal === 'number' && currentVal > 1000) {
          displayVal = currentVal / 1000;
        }

        console.log(`\n[${i + 1}/${WIZARD_STEPS.length}] ${step.question}`);
        if (step.description) console.log(`      \x1b[90m${step.description}\x1b[0m`);
        
        if (step.type === 'choice') {
          step.choices.forEach((c, idx) => console.log(`      ${idx + 1}) ${c}`));
        }

        let valid = false;
        while (!valid) {
          const raw = await this.prompt('      > ', displayVal);
          const parsed = this.parseValue(raw, step.type, step.choices);

          if (parsed === null && raw !== '') {
            console.log(`      \x1b[31mInvalid input. Please try again.\x1b[0m`);
            continue;
          }

          const valueToValidate = parsed === null ? displayVal : parsed;
          const validation = step.validate ? step.validate(valueToValidate) : true;

          if (validation === true) {
            answers[step.key] = valueToValidate;
            valid = true;
          } else {
            console.log(`      \x1b[31m${validation}\x1b[0m`);
          }
        }
      }

      console.log('\n\x1b[1m─── Configuration Summary ───────────────────────────\x1b[0m');
      Object.entries(answers).forEach(([k, v]) => {
        console.log(`  ${k.padEnd(20)} ${v}`);
      });
      console.log('\x1b[90m─────────────────────────────────────────────────────\x1b[0m\n');

      const save = await this.prompt('Save this configuration? (Y/n) ', 'y');
      if (['y', 'yes', 'true'].includes(String(save).toLowerCase())) {
        const finalConfig = this.formatConfigForFile(answers);
        const result = this.writeConfig(finalConfig);
        if (result.success) {
          console.log(`\n\x1b[32m✓ Configuration saved to ${this.configPath}\x1b[0m`);
          return { saved: true, config: finalConfig };
        } else {
          console.log(`\n\x1b[31m✗ Failed to save configuration.\x1b[0m`);
          return { saved: false, config: finalConfig };
        }
      } else {
        console.log('\nWizard cancelled — no changes made.');
        return { saved: false, config: answers };
      }
    } catch (err) {
      console.warn(`\nWizard failed: ${err.message}`);
      return { saved: false, config: answers };
    } finally {
      this.rl.close();
    }
  }

  async prompt(message, defaultVal) {
    const hint = defaultVal !== undefined ? ` [${defaultVal}]` : '';
    return new Promise(resolve => {
      this.rl.question(`${message}${hint}: `, resolve);
    });
  }

  parseValue(rawInput, type, choices = []) {
    const input = String(rawInput).trim();
    if (input === '') return null;

    if (type === 'boolean') {
      const low = input.toLowerCase();
      if (['y', 'yes', 'true', '1'].includes(low)) return true;
      if (['n', 'no', 'false', '0'].includes(low)) return false;
      return null;
    }

    if (type === 'number') {
      const n = parseFloat(input);
      return isNaN(n) ? null : n;
    }

    if (type === 'choice') {
      const idx = parseInt(input);
      if (!isNaN(idx) && idx > 0 && idx <= choices.length) {
        return choices[idx - 1];
      }
      if (choices.includes(input)) return input;
      return null;
    }

    return input;
  }

  formatConfigForFile(answers) {
    const out = { ...answers };
    if (out.RESPONSE_TIMEOUT) out.RESPONSE_TIMEOUT *= 1000;
    out.WIZARD_COMPLETED = true;
    return out;
  }

  writeConfig(configObject) {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(configObject, null, 2) + '\n', 'utf8');
      return { success: true, path: this.configPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  readExistingConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch {}
    return {};
  }
}

async function runWizard(configPath) {
  const wizard = new Wizard(configPath);
  return await wizard.run();
}

module.exports = { Wizard, runWizard, WIZARD_STEPS };
