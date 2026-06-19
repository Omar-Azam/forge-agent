// src/history.js — Persistent task history system for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const logger = require('./logger');
const security = require('./security');

/**
 * Generate a short unique ID for a history entry
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

class HistoryStore {
  constructor(historyFilePath = config.HISTORY_FILE) {
    this.historyFilePath = historyFilePath;
  }

  load() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const data = fs.readFileSync(this.historyFilePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && Array.isArray(parsed.entries)) {
          return parsed;
        }
      }
    } catch (err) {
      // If corrupt, we'll return the default structure below
    }
    return { version: 1, entries: [] };
  }

  save(history) {
    try {
      fs.mkdirSync(path.dirname(this.historyFilePath), { recursive: true });
      fs.writeFileSync(this.historyFilePath, JSON.stringify(history, null, 2), 'utf8');
    } catch (err) {
      // history failures should not crash the agent
    }
  }

  addEntry(entry) {
    if (!config.HISTORY_ENABLED) return;
    try {
      const history = this.load();

      // Fix 9 — Prevent history from storing sensitive content
      if (entry.finalOutput) {
        entry.finalOutput = security.sanitiseOutput(entry.finalOutput);
      }

      const newEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        ...entry
      };
      
      history.entries.unshift(newEntry);
      
      // Trim to max entries
      if (history.entries.length > config.HISTORY_MAX_ENTRIES) {
        history.entries = history.entries.slice(0, config.HISTORY_MAX_ENTRIES);
      }
      
      this.save(history);
      return newEntry.id;
    } catch (err) {
      // ignore
    }
  }

  getEntries(opts = {}) {
    const history = this.load();
    let entries = history.entries;

    if (opts.workingDir) {
      entries = entries.filter(e => e.workingDir === opts.workingDir);
    }

    if (opts.status) {
      entries = entries.filter(e => e.status === opts.status);
    }

    if (opts.search) {
      const search = opts.search.toLowerCase();
      entries = entries.filter(e => e.task.toLowerCase().includes(search));
    }

    if (opts.limit) {
      entries = entries.slice(0, opts.limit);
    }

    return entries;
  }

  getEntry(id) {
    const history = this.load();
    return history.entries.find(e => e.id === id) || null;
  }

  getRecent(n = 10) {
    const history = this.load();
    return history.entries.slice(0, n);
  }

  getById(id) {
    return this.getEntry(id);
  }

  findByPartialId(partialId) {
    const history = this.load();
    return history.entries.find(e => e.id.startsWith(partialId)) || null;
  }

  getRelativeTime(isoString) {
    try {
      if (!isoString) return 'unknown';
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return 'unknown';

      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);
      const diffWeeks = Math.floor(diffDays / 7);

      if (diffSec < 60) return 'just now';
      if (diffMin < 60) return `${diffMin} min ago`;
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays < 7) return `${diffDays} days ago`;
      return `${diffWeeks} weeks ago`;
    } catch {
      return 'unknown';
    }
  }

  formatCompact(entry, index) {
    if (!entry) return '';
    const task = entry.task || '(unknown task)';
    const time = this.getRelativeTime(entry.timestamp);
    const icons = {
      completed: '✅',
      partial: '⚠',
      failed: '❌',
      timeout: '⏱'
    };
    const icon = icons[entry.status] || ' ';
    const truncatedTask = task.length > 60 ? task.slice(0, 57) + '...' : task;

    return `[${index + 1}]  ${time.padEnd(12)}  ${icon}  ${truncatedTask}`;
  }

  getStats(workingDir = null) {
    const history = this.load();
    let entries = history.entries;

    if (workingDir) {
      entries = entries.filter(e => e.workingDir === workingDir);
    }

    const stats = {
      totalTasks: entries.length,
      completedTasks: entries.filter(e => e.status === 'completed').length,
      failedTasks: entries.filter(e => e.status === 'failed').length,
      totalFilesWritten: entries.reduce((sum, e) => sum + (e.filesWritten ? e.filesWritten.length : 0), 0),
      totalDurationMs: entries.reduce((sum, e) => sum + (e.durationMs || 0), 0),
      mostUsedModel: this._getMostUsed(entries, 'model'),
      mostUsedProfile: this._getMostUsed(entries, 'profile'),
      lastRunAt: entries.length > 0 ? entries[0].timestamp : null
    };

    return stats;
  }

  _getMostUsed(entries, key) {
    if (entries.length === 0) return 'n/a';
    const counts = {};
    entries.forEach(e => {
      const val = e[key] || 'default';
      counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  clearHistory(workingDir = null) {
    if (workingDir) {
      const history = this.load();
      history.entries = history.entries.filter(e => e.workingDir !== workingDir);
      this.save(history);
    } else {
      this.save({ version: 1, entries: [] });
    }
  }

  formatEntry(entry) {
    if (!entry) return 'Unknown entry';
    const date = new Date(entry.timestamp).toLocaleString();
    const icons = {
      completed: '✅',
      partial: '⚠',
      failed: '❌',
      timeout: '⏱'
    };
    const icon = icons[entry.status] || '❓';
    const duration = entry.durationMs ? (entry.durationMs / 1000).toFixed(1) + 's' : 'n/a';
    
    return [
      `[${date}]  ${icon}  ${entry.taskShort || entry.task.slice(0, 80)}`,
      `  ID: ${entry.id}`,
      `  Dir: ${entry.workingDir}`,
      `  Duration: ${duration}  •  ${entry.stepsCount || 0} steps  •  ${entry.filesWritten ? entry.filesWritten.length : 0} files written`,
      `  Model: ${entry.model || 'deepseek'}  •  Profile: ${entry.profile || 'default'}`
    ].join('\n');
  }

  formatList(entries) {
    if (!entries || entries.length === 0) return 'No task history found.';
    return entries.map((e, i) => `${i + 1}. ${this.formatEntry(e)}`).join('\n\n');
  }

  formatStats(stats) {
    const lastRun = stats.lastRunAt ? new Date(stats.lastRunAt).toLocaleString() : 'Never';
    return [
      `Total tasks: ${stats.totalTasks}`,
      `Completed: ${stats.completedTasks}  •  Failed: ${stats.failedTasks}`,
      `Files written across all tasks: ${stats.totalFilesWritten}`,
      `Most used model: ${stats.mostUsedModel}`,
      `Most used profile: ${stats.mostUsedProfile}`,
      `Last run: ${lastRun}`
    ].join('\n');
  }
}

module.exports = { HistoryStore, generateId };
