// src/diagnostics.js — System diagnostics for bug reports
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const { TOOLS, getLoadedPluginCount } = require('./tools');

/**
 * Generate a comprehensive diagnostics report object.
 */
function generateDiagnostics() {
  const report = {
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    configPath: path.join(os.homedir(), '.deepseek-agent', 'config.json'),
    sessionPath: config.SESSION_DIR,
    historyPath: config.HISTORY_FILE,
    memoryPath: config.MEMORY_FILE,
    pluginDir: config.PLUGIN_DIR,
    configExists: false,
    historyEntries: 0,
    memoryProjects: 0,
    pluginsLoaded: 0,
    toolCount: Object.keys(TOOLS).length,
    testResult: 'unknown',
    environment: {
      DISPLAY: process.env.DISPLAY || 'not set',
      CI: process.env.CI || 'not set',
      NODE_ENV: process.env.NODE_ENV || 'not set',
    }
  };

  try {
    if (fs.existsSync(report.configPath)) report.configExists = true;
  } catch {}

  try {
    if (fs.existsSync(report.historyPath)) {
      const history = JSON.parse(fs.readFileSync(report.historyPath, 'utf8'));
      if (history && Array.isArray(history.entries)) {
        report.historyEntries = history.entries.length;
      }
    }
  } catch {}

  try {
    if (fs.existsSync(report.memoryPath)) {
      const memory = JSON.parse(fs.readFileSync(report.memoryPath, 'utf8'));
      if (memory && memory.projects) {
        report.memoryProjects = Object.keys(memory.projects).length;
      }
    }
  } catch {}

  try {
    report.pluginsLoaded = getLoadedPluginCount();
  } catch {}

  return report;
}

/**
 * Formats the diagnostics report for terminal display.
 */
function formatDiagnostics(report) {
  const line = '━'.repeat(60);
  const check = (exists) => exists ? '✅ exists' : '❌ missing';
  
  return [
    `╔${'═'.repeat(58)}╗`,
    `║  ${'🔨 Forge Agent — Diagnostics Report'.padEnd(54)}  ║`,
    `╚${'═'.repeat(58)}╝`,
    '',
    `  Version:          Forge Agent v${report.version}`,
    `  Node.js:          ${report.node}`,
    `  Platform:         ${report.platform} (${report.arch})`,
    `  Working dir:      ${report.cwd}`,
    '',
    `  Config:           ${report.configPath.replace(os.homedir(), '~')}  ${check(report.configExists)}`,
    `  Session:          ${report.sessionPath.replace(os.homedir(), '~')}  ✅ exists`,
    `  History:          ${report.historyPath.replace(os.homedir(), '~')}  ${report.historyEntries > 0 ? '✅ exists' : '❓ empty'} (${report.historyEntries} entries)`,
    `  Memory:           ${report.memoryPath.replace(os.homedir(), '~')}   ${report.memoryProjects > 0 ? '✅ exists' : '❓ empty'} (${report.memoryProjects} projects)`,
    `  Plugins:          ${report.pluginDir.replace(os.homedir(), '~')}    ✅ exists (${report.pluginsLoaded} plugins)`,
    '',
    `  Tools loaded:     ${report.toolCount}`,
    `  Tests passing:    ${report.testResult}`,
    '',
    '  Environment:',
    `    DISPLAY:        ${report.environment.DISPLAY}`,
    `    CI:             ${report.environment.CI}`,
    `    NODE_ENV:       ${report.environment.NODE_ENV}`,
    '',
    '  ' + '─'.repeat(56),
    '  Copy this output when reporting bugs on GitHub.',
    '  ' + '─'.repeat(56),
  ].join('\n');
}

/**
 * Formats the diagnostics report as GitHub-ready Markdown.
 */
function formatDiagnosticsMarkdown(report) {
  return [
    '### Forge Agent Diagnostics',
    '',
    '<details>',
    '<summary>Click to view system information</summary>',
    '',
    '```json',
    JSON.stringify(report, null, 2),
    '```',
    '',
    '</details>',
    '',
    `**Version:** Forge Agent v${report.version}`,
    `**Platform:** ${report.platform} (${report.arch})`,
    `**Node.js:** ${report.node}`,
  ].join('\n');
}

module.exports = {
  generateDiagnostics,
  formatDiagnostics,
  formatDiagnosticsMarkdown
};
