// tests/history.test.js — Test suite for Forge Agent Task History
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { HistoryStore, generateId } = require('../src/history');
const config = require('../src/config');

const TEST_HISTORY_FILE = path.join(os.tmpdir(), `forge-history-test-${Date.now()}.json`);

describe('Task History System', () => {
  let store;

  beforeEach(() => {
    if (fs.existsSync(TEST_HISTORY_FILE)) fs.unlinkSync(TEST_HISTORY_FILE);
    store = new HistoryStore(TEST_HISTORY_FILE);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_HISTORY_FILE)) fs.unlinkSync(TEST_HISTORY_FILE);
  });

  test('HistoryStore loads empty structure when file missing', () => {
    const data = store.load();
    expect(data.entries).toEqual([]);
    expect(data.version).toBe(1);
  });

  test('HistoryStore handles corrupt JSON gracefully', () => {
    fs.writeFileSync(TEST_HISTORY_FILE, 'not json');
    const data = store.load();
    expect(data.entries).toEqual([]);
  });

  test('addEntry adds an entry to the entries array', () => {
    store.addEntry({ task: 'test task', workingDir: '/tmp' });
    const entries = store.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].task).toBe('test task');
  });

  test('addEntry generates a unique id for each entry', () => {
    const id1 = store.addEntry({ task: 'task 1' });
    const id2 = store.addEntry({ task: 'task 2' });
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
  });

  test('addEntry sets timestamp as ISO string', () => {
    store.addEntry({ task: 'test' });
    const entry = store.getEntries()[0];
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('addEntry prepends (newest entry is first)', () => {
    store.addEntry({ task: 'oldest' });
    store.addEntry({ task: 'newest' });
    const entries = store.getEntries();
    expect(entries[0].task).toBe('newest');
    expect(entries[1].task).toBe('oldest');
  });

  test('addEntry trims to 200 entries max', () => {
    const originalMax = config.HISTORY_MAX_ENTRIES;
    config.HISTORY_MAX_ENTRIES = 5;
    try {
      for (let i = 0; i < 10; i++) {
        store.addEntry({ task: `task ${i}` });
      }
      expect(store.getEntries().length).toBe(5);
      expect(store.getEntries()[0].task).toBe('task 9');
    } finally {
      config.HISTORY_MAX_ENTRIES = originalMax;
    }
  });

  test('addEntry calls save() after adding', () => {
    store.addEntry({ task: 'persistent' });
    const raw = JSON.parse(fs.readFileSync(TEST_HISTORY_FILE, 'utf8'));
    expect(raw.entries[0].task).toBe('persistent');
  });

  test('getEntries returns all entries when no filters', () => {
    store.addEntry({ task: 't1' });
    store.addEntry({ task: 't2' });
    expect(store.getEntries().length).toBe(2);
  });

  test('getEntries respects limit option', () => {
    for (let i = 0; i < 10; i++) store.addEntry({ task: `t${i}` });
    expect(store.getEntries({ limit: 3 }).length).toBe(3);
  });

  test('getEntries filters by workingDir', () => {
    store.addEntry({ task: 't1', workingDir: '/dir/a' });
    store.addEntry({ task: 't2', workingDir: '/dir/b' });
    const filtered = store.getEntries({ workingDir: '/dir/a' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].task).toBe('t1');
  });

  test('getEntries filters by status', () => {
    store.addEntry({ task: 't1', status: 'completed' });
    store.addEntry({ task: 't2', status: 'failed' });
    const filtered = store.getEntries({ status: 'completed' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].task).toBe('t1');
  });

  test('getEntries filters by search term (case-insensitive)', () => {
    store.addEntry({ task: 'Build a REST API' });
    store.addEntry({ task: 'Fix unit tests' });
    const filtered = store.getEntries({ search: 'rest' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].task).toBe('Build a REST API');
  });

  test('getEntries returns empty array when no matches', () => {
    store.addEntry({ task: 't1' });
    expect(store.getEntries({ search: 'nomatch' })).toEqual([]);
  });

  test('getEntry returns correct entry by id', () => {
    const id = store.addEntry({ task: 'find me' });
    const entry = store.getEntry(id);
    expect(entry.task).toBe('find me');
  });

  test('getEntry returns null for unknown id', () => {
    expect(store.getEntry('nonexistent')).toBeNull();
  });

  test('getStats returns correct totalTasks count', () => {
    store.addEntry({ task: 't1' });
    store.addEntry({ task: 't2' });
    expect(store.getStats().totalTasks).toBe(2);
  });

  test('getStats returns correct completedTasks count', () => {
    store.addEntry({ task: 't1', status: 'completed' });
    store.addEntry({ task: 't2', status: 'failed' });
    expect(store.getStats().completedTasks).toBe(1);
  });

  test('getStats returns lastRunAt as null when no entries', () => {
    expect(store.getStats().lastRunAt).toBeNull();
  });

  test('getStats returns correct lastRunAt when entries exist', () => {
    store.addEntry({ task: 't1' });
    expect(store.getStats().lastRunAt).toBeDefined();
  });

  test('clearHistory with workingDir removes only that dir\'s entries', () => {
    store.addEntry({ task: 't1', workingDir: '/a' });
    store.addEntry({ task: 't2', workingDir: '/b' });
    store.clearHistory('/a');
    const entries = store.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].workingDir).toBe('/b');
  });

  test('clearHistory with null removes all entries', () => {
    store.addEntry({ task: 't1' });
    store.clearHistory();
    expect(store.getEntries().length).toBe(0);
  });

  test('formatEntry returns non-empty string', () => {
    store.addEntry({ task: 'test', workingDir: '/tmp', status: 'completed' });
    const entry = store.getEntries()[0];
    const formatted = store.formatEntry(entry);
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  test('formatEntry contains the taskShort text', () => {
    store.addEntry({ task: 'test', taskShort: 'Short Task' });
    const formatted = store.formatEntry(store.getEntries()[0]);
    expect(formatted).toContain('Short Task');
  });

  test('formatList returns "No task history" message for empty array', () => {
    expect(store.formatList([])).toContain('No task history');
  });

  test('formatStats returns a string containing totalTasks', () => {
    const stats = store.getStats();
    const formatted = store.formatStats(stats);
    expect(formatted).toContain('Total tasks: 0');
  });

  test('getRecent(5) returns at most 5 entries', () => {
    for (let i = 0; i < 10; i++) store.addEntry({ task: `t${i}` });
    expect(store.getRecent(5).length).toBe(5);
  });

  test('getRecent returns newest entries first', () => {
    store.addEntry({ task: 'old' });
    store.addEntry({ task: 'new' });
    const recent = store.getRecent(2);
    expect(recent[0].task).toBe('new');
  });

  test('getRecent returns all entries when n > total count', () => {
    store.addEntry({ task: 't1' });
    expect(store.getRecent(10).length).toBe(1);
  });

  test('getById returns correct entry', () => {
    const id = store.addEntry({ task: 'target' });
    expect(store.getById(id).task).toBe('target');
  });

  test('getById returns null for unknown id', () => {
    expect(store.getById('unknown')).toBeNull();
  });

  test('findByPartialId returns entry matching first 6 chars of id', () => {
    const id = store.addEntry({ task: 'partial' });
    const partial = id.slice(0, 6);
    expect(store.findByPartialId(partial).task).toBe('partial');
  });

  test('findByPartialId returns null when no match', () => {
    expect(store.findByPartialId('nomatch')).toBeNull();
  });

  test('getRelativeTime returns "just now" for timestamp < 1 minute ago', () => {
    const now = new Date().toISOString();
    expect(store.getRelativeTime(now)).toBe('just now');
  });

  test('getRelativeTime returns "N min ago" for timestamp 30 minutes ago', () => {
    const past = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(store.getRelativeTime(past)).toBe('30 min ago');
  });

  test('getRelativeTime returns "N hours ago" for timestamp 5 hours ago', () => {
    const past = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(store.getRelativeTime(past)).toBe('5 hours ago');
  });

  test('getRelativeTime returns "N days ago" for timestamp 3 days ago', () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(store.getRelativeTime(past)).toBe('3 days ago');
  });

  test('getRelativeTime returns "unknown" for invalid input', () => {
    expect(store.getRelativeTime('invalid')).toBe('unknown');
    expect(store.getRelativeTime(null)).toBe('unknown');
  });

  test('formatCompact returns string containing task text', () => {
    const entry = { task: 'compact task', timestamp: new Date().toISOString() };
    expect(store.formatCompact(entry, 0)).toContain('compact task');
  });

  test('formatCompact returns string containing ✅ for completed status', () => {
    const entry = { task: 't', status: 'completed', timestamp: new Date().toISOString() };
    expect(store.formatCompact(entry, 0)).toContain('✅');
  });

  test('formatCompact returns string containing ⚠ for partial status', () => {
    const entry = { task: 't', status: 'partial', timestamp: new Date().toISOString() };
    expect(store.formatCompact(entry, 0)).toContain('⚠');
  });

  test('formatCompact handles missing task gracefully', () => {
    const entry = { timestamp: new Date().toISOString() };
    expect(store.formatCompact(entry, 0)).toContain('(unknown task)');
  });

  test('formatCompact handles missing timestamp gracefully', () => {
    const entry = { task: 't' };
    expect(store.formatCompact(entry, 0)).toContain('unknown');
  });

  test('generateId returns different values on repeated calls', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  test('HISTORY_ENABLED defaults to true in config', () => {
    expect(config.HISTORY_ENABLED).toBe(true);
  });

  test('save and load roundtrip preserves all entry fields', () => {
    const entry = {
      task: 'full task',
      taskShort: 'short',
      workingDir: '/abs/path',
      model: 'gpt',
      profile: 'dev',
      status: 'completed',
      durationMs: 1234,
      stepsCount: 5,
      filesWritten: ['f1', 'f2'],
      commandsRun: ['c1'],
      errorCount: 0,
      finalOutput: 'output'
    };
    store.addEntry(entry);
    const loaded = store.getEntries()[0];
    Object.keys(entry).forEach(key => {
      expect(loaded[key]).toEqual(entry[key]);
    });
  });
});
