// tests/memory.test.js — Memory System tests
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MemoryStore } = require('../src/memory');
const config = require('../src/config');

const TMP_DIR = path.join(os.tmpdir(), 'dsa-test-mem-' + Date.now());
const MEM_FILE = path.join(TMP_DIR, 'memory.json');

describe('Memory System', () => {
  beforeAll(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('MemoryStore loads empty structure when file missing', () => {
    const store = new MemoryStore(path.join(TMP_DIR, 'ghost.json'));
    const mem = store.load();
    expect(mem.projects).toEqual({});
  });

  test('MemoryStore handles corrupt JSON gracefully', () => {
    const corruptFile = path.join(TMP_DIR, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{ invalid json');
    const store = new MemoryStore(corruptFile);
    const mem = store.load();
    expect(mem.projects).toEqual({});
  });

  test('getProjectMemory returns empty object for new project', () => {
    const store = new MemoryStore(MEM_FILE);
    const mem = store.getProjectMemory('/fake/project');
    expect(mem.filesCreated).toEqual([]);
  });

  test('recordFilesCreated adds files and deduplicates', () => {
    const store = new MemoryStore(MEM_FILE);
    const dir = '/fake/project';
    store.recordFilesCreated(dir, ['a.js']);
    store.recordFilesCreated(dir, ['a.js', 'b.js']);
    const mem = store.getProjectMemory(dir);
    expect(mem.filesCreated).toContain('a.js');
    expect(mem.filesCreated).toContain('b.js');
    expect(mem.filesCreated.length).toBe(2);
  });

  test('recordFilesCreated respects max 50 entries limit', () => {
    const store = new MemoryStore(MEM_FILE);
    const dir = '/limit/test';
    const files = Array.from({ length: 60 }, (_, i) => `f${i}.js`);
    store.recordFilesCreated(dir, files);
    const mem = store.getProjectMemory(dir);
    expect(mem.filesCreated.length).toBe(50);
  });

  test('recordTechStack adds and deduplicates packages', () => {
    const store = new MemoryStore(MEM_FILE);
    const dir = '/fake/project';
    store.recordTechStack(dir, ['express']);
    store.recordTechStack(dir, ['express', 'jest']);
    const mem = store.getProjectMemory(dir);
    expect(mem.techStack).toContain('express');
    expect(mem.techStack).toContain('jest');
    expect(mem.techStack.length).toBe(2);
  });

  test('recordCompletedTask prepends', () => {
    const store = new MemoryStore(MEM_FILE);
    const dir = '/fake/project';
    store.recordCompletedTask(dir, 'task1');
    store.recordCompletedTask(dir, 'task2');
    const mem = store.getProjectMemory(dir);
    expect(mem.completedTasks[0]).toBe('task2');
  });

  test('buildMemoryContext returns formatted string', () => {
    const store = new MemoryStore(MEM_FILE);
    const dir = '/fake/project';
    // The store may already have data from previous tests if using the same file
    store.recordTechStack(dir, ['react']);
    store.recordCompletedTask(dir, 'built ui');
    
    const context = store.buildMemoryContext(dir);
    expect(context).toContain('react');
    expect(context).toContain('built ui');
  });

  test('clearProjectMemory removes project data', () => {
    const store = new MemoryStore(MEM_FILE);
    const dir = '/fake/project';
    store.recordTechStack(dir, ['foo']);
    store.clearProjectMemory(dir);
    const mem = store.load();
    expect(mem.projects[dir]).toBeUndefined();
  });
});
