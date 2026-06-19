// src/tool-cache.js — In-session tool result cache
'use strict';

class ToolCache {
  constructor(opts = {}) {
    this.maxEntries = opts.maxEntries || 200;
    this.defaultTtlMs = opts.defaultTtlMs !== undefined ? opts.defaultTtlMs : 30000;
    this.enabled = opts.enabled !== undefined ? opts.enabled : true;

    this.cache = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  _makeKey(toolName, args) {
    // Sort keys for consistency
    const sortedArgs = this._sortObjectKeys(args);
    return JSON.stringify({ toolName, args: sortedArgs });
  }

  _sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this._sortObjectKeys(obj[key]);
    });
    return sorted;
  }

  get(toolName, args) {
    if (!this.enabled) return null;

    const key = this._makeKey(toolName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return null;
    }

    const now = Date.now();
    if (entry.expiresAt !== 0 && now > entry.expiresAt) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    // Move to end of Map for LRU
    this.cache.delete(key);
    entry.accessedAt = now;
    entry.hits++;
    this.cache.set(key, entry);

    this.hitCount++;
    return entry.result;
  }

  set(toolName, args, result, ttlMs) {
    if (!this.enabled) return;

    const key = this._makeKey(toolName, args);
    const now = Date.now();
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = ttl === 0 ? 0 : now + ttl;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      this._evictOldest();
    }

    this.cache.set(key, {
      result,
      cachedAt: now,
      expiresAt,
      accessedAt: now,
      hits: 0,
      toolName
    });
  }

  _evictOldest() {
    // Map.keys().next().value gives the first (oldest inserted/accessed) key
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
      this.evictionCount++;
    }
  }

  invalidate(toolName, args) {
    const key = this._makeKey(toolName, args);
    this.cache.delete(key);
  }

  invalidateByTool(toolName) {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.toolName === toolName) {
        this.cache.delete(key);
      }
    }
  }

  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  stats() {
    const total = this.hitCount + this.missCount;
    const hitRate = total === 0 ? '0%' : ((this.hitCount / total) * 100).toFixed(1) + '%';

    return {
      entries: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      evictions: this.evictionCount,
      hitRate
    };
  }

  shouldCache(toolName) {
    const cacheable = [
      'read_file', 'list_directory', 'get_file_info', 'find_files',
      'search_in_files', 'search_codebase', 'git_log', 'git_branches',
      'git_show', 'git_blame', 'read_env', 'list_env_files', 'check_env_vars',
      'read_url', 'git_status'
    ];
    return cacheable.includes(toolName);
  }

  invalidatesCache(toolName) {
    const mapping = {
      'write_file': ['read_file', 'list_directory', 'get_file_info', 'find_files', 'search_in_files', 'search_codebase'],
      'append_to_file': ['read_file', 'get_file_info', 'search_in_files', 'search_codebase'],
      'replace_in_file': ['read_file', 'get_file_info', 'search_in_files', 'search_codebase'],
      'delete_file': ['read_file', 'list_directory', 'get_file_info', 'find_files', 'search_in_files', 'search_codebase'],
      'move_file': ['read_file', 'list_directory', 'get_file_info', 'find_files', 'search_in_files', 'search_codebase'],
      'copy_file': ['read_file', 'list_directory', 'get_file_info', 'find_files', 'search_in_files', 'search_codebase'],
      'create_directory': ['list_directory', 'get_file_info', 'find_files'],
      'run_command': ['git_status', 'git_log', 'git_diff', 'list_directory', 'read_file', 'search_codebase'],
      'write_files': ['read_file', 'list_directory', 'get_file_info', 'find_files', 'search_in_files', 'search_codebase'],
      'set_env_var': ['read_env', 'list_env_files', 'check_env_vars'],
      'delete_env_var': ['read_env', 'list_env_files', 'check_env_vars'],
      'install_package': ['search_codebase', 'read_file'], // package.json might change
      'patch_file': ['read_file', 'get_file_info', 'search_in_files', 'search_codebase']
    };

    // Generic write operations should also bust some common caches
    const writeTools = [
      'write_file', 'append_to_file', 'replace_in_file', 'delete_file',
      'move_file', 'copy_file', 'create_directory', 'write_files', 'patch_file'
    ];

    let toInvalidate = mapping[toolName] || [];

    if (writeTools.includes(toolName)) {
      // Any write tool should also invalidate git_status as it tracks changes
      if (!toInvalidate.includes('git_status')) toInvalidate.push('git_status');
    }

    return toInvalidate.length > 0 ? toInvalidate : null;
  }
}

module.exports = ToolCache;
