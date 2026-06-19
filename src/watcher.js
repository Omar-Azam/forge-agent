// src/watcher.js — File system watch mode for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Matches a file path against a list of glob patterns.
 * Supports: *, **, ?
 */
function matchesPattern(filePath, patterns) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    
    // Convert glob to regex using placeholders to avoid double replacement
    let regexStr = normalizedPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars
      .replace(/\?/g, '___Q___')            // ? placeholder
      .replace(/\*\*\//g, '___DD___')       // **/ placeholder
      .replace(/\/\*\*/g, '___DE___')       // /** placeholder
      .replace(/\*\*/g, '___DS___')         // ** placeholder
      .replace(/\*/g, '___S___');           // * placeholder
      
    regexStr = regexStr
      .replace(/___Q___/g, '[^/]')
      .replace(/___DD___/g, '(?:.*/)?')
      .replace(/___DE___/g, '(?:/.*)?')
      .replace(/___DS___/g, '.*')
      .replace(/___S___/g, '[^/]*');

    const regex = new RegExp(`^${regexStr}$`);
    if (regex.test(normalizedPath)) return true;
    
    // Also check if it's a directory match for patterns like "src/**"
    if (normalizedPattern.endsWith('/**')) {
      const dirBase = normalizedPattern.slice(0, -3);
      if (normalizedPath === dirBase || normalizedPath.startsWith(dirBase + '/')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves patterns to unique top-level directories for fs.watch.
 */
function expandPatterns(patterns, cwd) {
  const dirs = new Set();
  for (const pattern of patterns) {
    const parts = pattern.split(/[/*?]/);
    const root = parts[0] || '.';
    const absRoot = path.isAbsolute(root) ? root : path.join(cwd, root);
    
    if (fs.existsSync(absRoot)) {
      if (fs.statSync(absRoot).isDirectory()) {
        dirs.add(absRoot);
      } else {
        dirs.add(path.dirname(absRoot));
      }
    } else {
      // If root doesn't exist yet, watch CWD
      dirs.add(cwd);
    }
  }
  
  // Deduplicate: if we watch CWD, we don't need to watch subdirs explicitly
  const sorted = Array.from(dirs).sort((a, b) => a.length - b.length);
  const unique = [];
  for (const dir of sorted) {
    if (!unique.some(u => dir === u || dir.startsWith(u + path.sep))) {
      unique.push(dir);
    }
  }
  return unique;
}

function shouldIgnore(filePath, ignored) {
  const normalized = filePath.replace(/\\/g, '/');
  return ignored.some(p => {
    const normP = p.replace(/\\/g, '/');
    return normalized === normP || 
           normalized.startsWith(normP + '/') || 
           normalized.includes('/' + normP + '/');
  });
}

class FileWatcher {
  constructor(opts = {}) {
    this.patterns = opts.patterns || ['**/*'];
    this.ignored = opts.ignored || ['node_modules', '.git', 'dist'];
    this.debounceMs = opts.debounceMs || 1000;
    this.cwd = opts.cwd || process.cwd();
    
    this._watchers = [];
    this._onChangeCallback = null;
    this._onErrorCallback = null;
    this._debounceTimer = null;
    this._changedFiles = new Map();
    this._isWatching = false;
  }

  start() {
    if (this._isWatching) return this;
    
    const watchDirs = expandPatterns(this.patterns, this.cwd);
    
    for (const dir of watchDirs) {
      try {
        const watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
          if (!filename) return;
          
          const fullPath = path.join(dir, filename);
          const relPath = path.relative(this.cwd, fullPath);
          
          if (shouldIgnore(relPath, this.ignored)) return;
          if (!matchesPattern(relPath, this.patterns)) return;

          this._handleEvent(event, fullPath, relPath);
        });
        
        this._watchers.push(watcher);
      } catch (err) {
        // Fallback for systems without recursive fs.watch support
        this._watchSubtree(dir);
      }
    }
    
    this._isWatching = true;
    return this;
  }

  _watchSubtree(root) {
    const walk = (dir) => {
      try {
        const watcher = fs.watch(dir, { recursive: false }, (event, filename) => {
          if (!filename) return;
          const fullPath = path.join(dir, filename);
          const relPath = path.relative(this.cwd, fullPath);
          if (shouldIgnore(relPath, this.ignored)) return;
          if (matchesPattern(relPath, this.patterns)) {
            this._handleEvent(event, fullPath, relPath);
          }
          // If a new directory is created, watch it too
          if (event === 'rename') {
            try {
              if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                walk(fullPath);
              }
            } catch {}
          }
        });
        this._watchers.push(watcher);
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            const full = path.join(dir, e.name);
            const rel = path.relative(this.cwd, full);
            if (!shouldIgnore(rel, this.ignored)) walk(full);
          }
        }
      } catch {}
    };
    walk(root);
  }

  _handleEvent(event, fullPath, relPath) {
    this._changedFiles.set(fullPath, { path: fullPath, event, relativePath: relPath });
    
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    
    this._debounceTimer = setTimeout(() => {
      const files = Array.from(this._changedFiles.values());
      this._changedFiles.clear();
      if (this._onChangeCallback && files.length > 0) {
        this._onChangeCallback(files);
      }
    }, this.debounceMs);
  }

  stop() {
    this._watchers.forEach(w => w.close());
    this._watchers = [];
    this._isWatching = false;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    return this;
  }

  onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }

  onError(callback) {
    this._onErrorCallback = callback;
    return this;
  }

  get isWatching() { return this._isWatching; }
  get watchedPaths() { return this.patterns; }
}

class WatchSession {
  constructor(opts = {}) {
    this.task = opts.task;
    this.patterns = opts.patterns || ['src/**/*', '*.js', '*.ts', '*.py'];
    this.agent = opts.agent;
    this.maxRuns = opts.maxRuns || 0;
    this.cooldownMs = opts.cooldownMs || 5000;
    this.exitOnError = opts.exitOnError || false;
    
    this.watcher = new FileWatcher({
      patterns: this.patterns,
      debounceMs: opts.debounceMs || 1000,
      cwd: process.cwd()
    });
    
    this._runCount = 0;
    this._isRunningTask = false;
    this._lastRunFinishedAt = 0;
  }

  async start() {
    console.log('\n\x1b[36m👁  Watching for changes... (Ctrl+C to stop)\x1b[0m');
    console.log(`\x1b[90m   Patterns: ${this.patterns.join(', ')}\x1b[0m\n`);

    this.watcher.onChange(async (files) => {
      if (this._isRunningTask) return;
      
      const now = Date.now();
      if (now - this._lastRunFinishedAt < this.cooldownMs) return;

      console.log(`\n\x1b[33m⚡ Change detected in ${files.length} file(s):\x1b[0m`);
      files.slice(0, 5).forEach(f => console.log(`   - ${f.relativePath}`));
      if (files.length > 5) console.log(`   - ...and ${files.length - 5} more`);

      this._isRunningTask = true;
      this._runCount++;

      try {
        await this.agent.run(this.task);
        console.log('\n\x1b[32m✓ Done. Watching for next change...\x1b[0m');
      } catch (err) {
        console.error(`\n\x1b[31m✗ Task failed: ${err.message}\x1b[0m`);
        if (this.exitOnError) {
          this.stop();
          process.exit(1);
        }
      } finally {
        this._isRunningTask = false;
        this._lastRunFinishedAt = Date.now();
        
        if (this.maxRuns > 0 && this._runCount >= this.maxRuns) {
          console.log(`\nReached max runs (${this.maxRuns}). Stopping watcher.`);
          this.stop();
        }
      }
    });

    this.watcher.start();
  }

  stop() {
    this.watcher.stop();
  }

  get runCount() { return this._runCount; }
}

module.exports = { FileWatcher, WatchSession, matchesPattern, expandPatterns, shouldIgnore };
