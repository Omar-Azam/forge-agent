// src/profiles.js — Agent profile definitions and loader
'use strict';

const fs = require('fs');
const path = require('path');

const BUILTIN_PROFILES = {
  backend: {
    name: 'backend',
    description: 'Optimised for Node.js, Python, Go, and REST API development',
    systemPromptAddition: `You are working on a backend/server-side project.
Prefer: modular code, proper error handling, environment variables for config, input validation.
Always: write tests alongside code, use async/await, handle edge cases.
File patterns to focus on: *.js, *.ts, *.py, *.go, *.rs, *.sql
Avoid modifying: node_modules/, dist/, build/, .env files directly.`,
    preferredTools: ['read_file', 'write_file', 'run_command', 'run_tests', 'git_status', 'install_package', 'read_env', 'git_diff'],
    ignoredPatterns: ['node_modules', 'dist', '.next', 'build', '__pycache__'],
    planningMode: true
  },
  frontend: {
    name: 'frontend',
    description: 'Optimised for React, Vue, HTML/CSS, and UI development',
    systemPromptAddition: `You are working on a frontend/UI project.
Prefer: component-based architecture, responsive design, accessibility best practices.
Always: check for console errors, test in multiple screen sizes, use semantic HTML.
File patterns to focus on: *.jsx, *.tsx, *.vue, *.svelte, *.css, *.scss, *.html
Avoid: large bundle sizes, inline styles, deprecated APIs.`,
    preferredTools: ['read_file', 'write_file', 'run_command', 'run_tests', 'list_directory', 'search_codebase', 'diff_files'],
    ignoredPatterns: ['node_modules', 'dist', '.next', 'build', 'coverage'],
    planningMode: false
  },
  'data-science': {
    name: 'data-science',
    description: 'Optimised for Python data analysis, ML, and Jupyter notebooks',
    systemPromptAddition: `You are working on a data science or machine learning project.
Prefer: pandas/numpy for data manipulation, clear variable names, reproducible code.
Always: check data shapes and types, handle missing values, document assumptions.
File patterns to focus on: *.py, *.ipynb, *.csv, *.json, requirements.txt
Avoid: memory inefficient operations on large datasets, hardcoded paths.`,
    preferredTools: ['read_file', 'write_file', 'run_command', 'run_tests', 'install_package', 'find_files', 'search_in_files'],
    ignoredPatterns: ['__pycache__', '.ipynb_checkpoints', 'venv', '.venv', 'data/raw'],
    planningMode: false
  },
  devops: {
    name: 'devops',
    description: 'Optimised for Docker, CI/CD, shell scripts, and infrastructure',
    systemPromptAddition: `You are working on DevOps, infrastructure, or deployment configuration.
Prefer: idempotent operations, clear logging, environment variable configuration, minimal images.
Always: validate syntax before applying, handle rollback scenarios, document commands.
File patterns to focus on: Dockerfile, docker-compose.yml, *.yaml, *.yml, *.sh, Makefile
Avoid: hardcoded credentials, latest tags in production, running as root.`,
    preferredTools: ['run_command', 'read_file', 'write_file', 'read_env', 'set_env_var', 'start_process', 'git_status'],
    ignoredPatterns: ['node_modules', '__pycache__', '.terraform', '*.tfstate'],
    planningMode: true
  },
  default: {
    name: 'default',
    description: 'General purpose — no specialisation',
    systemPromptAddition: '',
    preferredTools: [],
    ignoredPatterns: [],
    planningMode: false
  }
};

const SUPPORTED_PROFILES = Object.keys(BUILTIN_PROFILES);

/**
 * Returns the profile object for the given name (case-insensitive).
 */
function getProfile(name) {
  if (!name) return BUILTIN_PROFILES.default;
  const key = name.toLowerCase();
  if (BUILTIN_PROFILES[key]) {
    return BUILTIN_PROFILES[key];
  }
  throw new Error(`Unknown profile "${name}". Valid profiles: ${SUPPORTED_PROFILES.join(', ')}`);
}

/**
 * Returns array of all builtin profile objects.
 */
function listProfiles() {
  return Object.values(BUILTIN_PROFILES);
}

/**
 * Merges profile settings into config object.
 * Returns modified config (does not mutate original).
 */
function applyProfile(profile, config) {
  return {
    ...config,
    PLANNING_MODE: profile.planningMode,
    ACTIVE_PROFILE: profile.name
  };
}

/**
 * Returns the systemPromptAddition string for a profile name.
 */
function getProfileSystemPromptAddition(profileName) {
  try {
    const profile = getProfile(profileName);
    let addition = profile.systemPromptAddition || '';
    
    if (profile.preferredTools && profile.preferredTools.length > 0) {
      addition += '\n\nPREFERRED TOOLS FOR THIS PROFILE:\n' + profile.preferredTools.join(', ');
    }
    
    return addition;
  } catch {
    return '';
  }
}

/**
 * Loads a user-defined profile from a JSON file.
 */
function loadCustomProfile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Validation
    if (!data.name || typeof data.name !== 'string' ||
        !data.description || typeof data.description !== 'string' ||
        !data.systemPromptAddition || typeof data.systemPromptAddition !== 'string') {
      return { success: false, error: 'Custom profile missing required fields: name, description, systemPromptAddition' };
    }

    const profile = {
      name: data.name,
      description: data.description,
      systemPromptAddition: data.systemPromptAddition,
      preferredTools: Array.isArray(data.preferredTools) ? data.preferredTools : [],
      ignoredPatterns: Array.isArray(data.ignoredPatterns) ? data.ignoredPatterns : [],
      planningMode: typeof data.planningMode === 'boolean' ? data.planningMode : false
    };

    return { success: true, profile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getProfile,
  listProfiles,
  applyProfile,
  getProfileSystemPromptAddition,
  loadCustomProfile,
  SUPPORTED_PROFILES
};