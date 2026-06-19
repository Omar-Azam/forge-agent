// src/plugin-loader.js — Plugin discovery and loading system
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

/**
 * Scans the plugin directory for .js files.
 */
function discoverPlugins(pluginDir) {
  if (!fs.existsSync(pluginDir)) return [];
  
  try {
    return fs.readdirSync(pluginDir)
      .filter(file => file.endsWith('.js') && !file.startsWith('_'))
      .map(file => path.join(pluginDir, file));
  } catch (err) {
    logger.warn(`Failed to discover plugins in ${pluginDir}: ${err.message}`);
    return [];
  }
}

/**
 * Loads and validates a single plugin file.
 */
function loadPlugin(filePath) {
  try {
    const plugin = require(filePath);
    
    // Simple validation
    if (!plugin.name || typeof plugin.name !== 'string' ||
        !plugin.description || typeof plugin.description !== 'string' ||
        !plugin.execute || typeof plugin.execute !== 'function') {
      return { success: false, error: 'Plugin missing name, description, or execute function' };
    }

    if (!/^[a-z][a-z0-9_]*$/.test(plugin.name)) {
      return { success: false, error: 'Plugin name must be lowercase alphanumeric with underscores' };
    }

    return { success: true, tool: plugin };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Loads all valid plugins from the plugin directory.
 */
function loadAllPlugins(pluginDir, existingToolNames) {
  const pluginFiles = discoverPlugins(pluginDir);
  const loaded = [];
  const failed = [];

  for (const filePath of pluginFiles) {
    const result = loadPlugin(filePath);
    if (result.success) {
      if (existingToolNames.includes(result.tool.name)) {
        failed.push({ file: filePath, error: `Name conflict: tool "${result.tool.name}" already exists` });
      } else {
        loaded.push(result.tool);
      }
    } else {
      failed.push({ file: filePath, error: result.error });
    }
  }

  return { loaded, failed };
}

/**
 * Validates a plugin object shape.
 */
function validatePlugin(plugin) {
  const errors = [];
  if (!plugin.name) errors.push('Missing name');
  if (!plugin.description) errors.push('Missing description');
  if (!plugin.execute) errors.push('Missing execute function');
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Creates a template stub for a new plugin.
 */
function createPluginStub(name) {
  return `module.exports = {
  name: '${name}',
  description: 'A custom tool that does something useful',
  parameters: {
    // Define parameters here
    // param: { type: 'string', required: true, description: '...' }
  },
  async execute(args) {
    // Implement tool logic here
    return 'Result from ${name}';
  },
};
`;
}

module.exports = {
  discoverPlugins,
  loadPlugin,
  loadAllPlugins,
  validatePlugin,
  createPluginStub
};
