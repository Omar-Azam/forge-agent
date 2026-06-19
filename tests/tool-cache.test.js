// tests/tool-cache.test.js — Test suite for tool result caching
'use strict';

const ToolCache = require('../src/tool-cache');
const config = require('../src/config');

describe('ToolCache', () => {
  let cache;

  beforeEach(() => {
    cache = new ToolCache({
      maxEntries: 3,
      defaultTtlMs: 100, // short TTL for testing
      enabled: true
    });
  });

  test('initialises with empty state', () => {
    const stats = cache.stats();
    expect(stats.entries).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  test('get returns null for uncached key', () => {
    expect(cache.get('read_file', { path: 'test.txt' })).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  test('set then get returns the cached result', () => {
    cache.set('read_file', { path: 'test.txt' }, 'file content');
    expect(cache.get('read_file', { path: 'test.txt' })).toBe('file content');
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().entries).toBe(1);
  });

  test('get returns null after TTL expires', (done) => {
    cache.set('read_file', { path: 'test.txt' }, 'content', 10);
    setTimeout(() => {
      expect(cache.get('read_file', { path: 'test.txt' })).toBeNull();
      done();
    }, 20);
  });

  test('get returns result before TTL expires', (done) => {
    cache.set('read_file', { path: 'test.txt' }, 'content', 100);
    setTimeout(() => {
      expect(cache.get('read_file', { path: 'test.txt' })).toBe('content');
      done();
    }, 10);
  });

  test('set with ttlMs=0 never expires', (done) => {
    cache.set('read_file', { path: 'test.txt' }, 'content', 0);
    setTimeout(() => {
      expect(cache.get('read_file', { path: 'test.txt' })).toBe('content');
      done();
    }, 50);
  });

  test('LRU eviction removes oldest entry when maxEntries exceeded', () => {
    cache.set('tool', { id: 1 }, 'res1');
    cache.set('tool', { id: 2 }, 'res2');
    cache.set('tool', { id: 3 }, 'res3');
    
    // Access id: 1 to make it "newest" accessed
    cache.get('tool', { id: 1 });
    
    // Add 4th entry, should evict id: 2 (oldest accessed)
    cache.set('tool', { id: 4 }, 'res4');
    
    expect(cache.get('tool', { id: 2 })).toBeNull();
    expect(cache.get('tool', { id: 1 })).toBe('res1');
    expect(cache.get('tool', { id: 3 })).toBe('res3');
    expect(cache.get('tool', { id: 4 })).toBe('res4');
    expect(cache.stats().evictions).toBe(1);
  });

  test('invalidate removes specific entry', () => {
    cache.set('read_file', { path: 'a' }, 'resA');
    cache.set('read_file', { path: 'b' }, 'resB');
    cache.invalidate('read_file', { path: 'a' });
    expect(cache.get('read_file', { path: 'a' })).toBeNull();
    expect(cache.get('read_file', { path: 'b' })).toBe('resB');
  });

  test('invalidateByTool removes all entries for that tool', () => {
    cache.set('read_file', { path: 'a' }, 'resA');
    cache.set('read_file', { path: 'b' }, 'resB');
    cache.set('list_directory', { path: '.' }, 'resDir');
    
    cache.invalidateByTool('read_file');
    
    expect(cache.get('read_file', { path: 'a' })).toBeNull();
    expect(cache.get('read_file', { path: 'b' })).toBeNull();
    expect(cache.get('list_directory', { path: '.' })).toBe('resDir');
  });

  test('invalidatePattern removes matching entries', () => {
    cache.set('read_file', { path: 'test.js' }, 'js');
    cache.set('read_file', { path: 'test.txt' }, 'txt');
    
    cache.invalidatePattern(/\.js/);
    
    expect(cache.get('read_file', { path: 'test.js' })).toBeNull();
    expect(cache.get('read_file', { path: 'test.txt' })).toBe('txt');
  });

  test('clear empties entire cache', () => {
    cache.set('a', {}, 'val');
    cache.clear();
    expect(cache.stats().entries).toBe(0);
    expect(cache.get('a', {})).toBeNull();
  });

  test('stats hitRate increases after cache hits', () => {
    cache.set('a', {}, 'val');
    cache.get('a', {});
    expect(cache.stats().hitRate).toBe('100.0%');
    cache.get('b', {});
    expect(cache.stats().hitRate).toBe('50.0%');
  });

  test('stats tracks misses correctly', () => {
    cache.get('a', {});
    cache.get('b', {});
    expect(cache.stats().misses).toBe(2);
  });

  test('shouldCache returns true for read_file', () => {
    expect(cache.shouldCache('read_file')).toBe(true);
  });

  test('shouldCache returns true for list_directory', () => {
    expect(cache.shouldCache('list_directory')).toBe(true);
  });

  test('shouldCache returns true for git_log', () => {
    expect(cache.shouldCache('git_log')).toBe(true);
  });

  test('shouldCache returns false for write_file', () => {
    expect(cache.shouldCache('write_file')).toBe(false);
  });

  test('shouldCache returns false for run_command', () => {
    expect(cache.shouldCache('run_command')).toBe(false);
  });

  test('shouldCache returns false for run_tests', () => {
    expect(cache.shouldCache('run_tests')).toBe(false);
  });

  test('invalidatesCache returns truthy for write_file', () => {
    const result = cache.invalidatesCache('write_file');
    expect(result).toContain('read_file');
    expect(result).toContain('list_directory');
  });

  test('invalidatesCache returns truthy for run_command', () => {
    const result = cache.invalidatesCache('run_command');
    expect(result).toContain('git_status');
    expect(result).toContain('list_directory');
  });

  test('_makeKey produces same key for same args regardless of object key order', () => {
    const key1 = cache._makeKey('tool', { a: 1, b: 2 });
    const key2 = cache._makeKey('tool', { b: 2, a: 1 });
    expect(key1).toBe(key2);
  });

  test('cache is disabled when enabled:false option passed', () => {
    const disabledCache = new ToolCache({ enabled: false });
    disabledCache.set('read_file', { path: 'a' }, 'res');
    expect(disabledCache.get('read_file', { path: 'a' })).toBeNull();
    expect(disabledCache.stats().entries).toBe(0);
  });

  test('CACHE_ENABLED defaults to true in config', () => {
    expect(config.CACHE_ENABLED).toBe(true);
  });

  test('invalidatesCache returns truthy for append_to_file', () => {
    const result = cache.invalidatesCache('append_to_file');
    expect(result).toContain('read_file');
  });

  test('invalidatesCache returns truthy for delete_file', () => {
    const result = cache.invalidatesCache('delete_file');
    expect(result).toContain('read_file');
    expect(result).toContain('list_directory');
  });

  test('stats tracks evictions correctly', () => {
    cache.set('a', {}, 1);
    cache.set('b', {}, 2);
    cache.set('c', {}, 3);
    cache.set('d', {}, 4); // should evict 'a'
    expect(cache.stats().evictions).toBe(1);
  });
});
