// src/adapter-factory.js — Factory for model adapters
'use strict';

const SUPPORTED_MODELS = ['deepseek', 'gemini'];

/**
 * Get an adapter instance for the specified model.
 *
 * @param {string} modelName - Name or alias of the model
 * @param {Object} page      - Playwright page object
 * @param {Object} config    - Configuration object
 * @returns {BaseAdapter}
 */
function getAdapter(modelName, page, config) {
  const name = (modelName || 'deepseek').toLowerCase().trim();

  switch (name) {
    case 'deepseek':
    case 'deepseek-r1':
    case 'r1': {
      const DeepSeekAdapter = require('./adapters/deepseek-adapter');
      return new DeepSeekAdapter(page, config);
    }
    case 'chatgpt':
    case 'gpt':
    case 'openai': {
      throw new Error(
        'ChatGPT adapter is currently disabled.\n' +
        'ChatGPT\'s web UI has aggressive bot detection that causes\n' +
        'unreliable tool call execution.\n\n' +
        'Please use DeepSeek (default) or Gemini instead:\n' +
        '  forge-agent --model=deepseek "your task"\n' +
        '  forge-agent --model=gemini "your task"'
      );
    }
    case 'gemini':
    case 'google':
    case 'bard': {
      const GeminiAdapter = require('./adapters/gemini-adapter');
      return new GeminiAdapter(page, config);
    }
    default:
      throw new Error(
        `Unknown model: "${modelName}"\n` +
        `Supported models: ${SUPPORTED_MODELS.join(', ')}\n` +
        `Usage: forge-agent --model=gemini "your task"`
      );
  }
}

/**
 * Get the homepage URL for a model.
 */
function getModelUrl(modelName) {
  const name = (modelName || 'deepseek').toLowerCase();
  const urls = {
    deepseek: 'https://chat.deepseek.com',
    gemini  : 'https://gemini.google.com/app',
  };
  return urls[name] || urls.deepseek;
}

/**
 * Get the human-readable display name for a model.
 */
function getModelDisplayName(modelName) {
  const names = {
    deepseek: 'DeepSeek',
    gemini  : 'Gemini',
  };
  return names[(modelName || '').toLowerCase()] || modelName;
}

module.exports = { 
  getAdapter, 
  getModelUrl, 
  getModelDisplayName, 
  SUPPORTED_MODELS 
};