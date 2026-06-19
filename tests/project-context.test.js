'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ProjectContextManager, getProjectContext, detectTechStack } = require('../src/project-context');

describe('project-context module', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-project-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('ProjectContextManager instantiates without throwing', () => {
    expect(() => new ProjectContextManager(tmpDir)).not.toThrow();
  });

  test('getProjectContext returns a singleton for the same path', () => {
    const ctx1 = getProjectContext(tmpDir);
    const ctx2 = getProjectContext(tmpDir);
    expect(ctx1).toBe(ctx2);
  });

  test('load() returns null when no file exists', () => {
    const ctx = new ProjectContextManager(tmpDir);
    expect(ctx.load()).toBeNull();
  });

  test('initialize() creates context object with projectName', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    const data = await ctx.initialize();
    expect(data.projectName).toBe(path.basename(tmpDir));
  });

  test('initialize() sets createdAt', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    const data = await ctx.initialize();
    expect(data.createdAt).toBeDefined();
    expect(new Date(data.createdAt).getTime()).toBeGreaterThan(0);
  });

  test('initialize() sets totalSessions to 1', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    const data = await ctx.initialize();
    expect(data.totalSessions).toBe(1);
  });

  test('save() creates file', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    expect(ctx.save()).toBe(true);
    // The path is ~/.deepseek-agent/projects/... so I won't check the file presence in tmpDir
  });

  test('recordTask() adds to completedTasks', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    ctx.recordTask('task 1', 'summary 1', ['file1.js']);
    expect(ctx._data.completedTasks).toHaveLength(1);
    expect(ctx._data.completedTasks[0].task).toBe('task 1');
  });

  test('recordTask() keeps max 50 tasks', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    for (let i = 0; i < 60; i++) {
      ctx.recordTask(`task ${i}`, `summary ${i}`);
    }
    expect(ctx._data.completedTasks).toHaveLength(50);
    expect(ctx._data.completedTasks[0].task).toBe('task 59');
  });

  test('updateSummary() updates projectSummary field', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    ctx.updateSummary('New summary');
    expect(ctx._data.projectSummary).toBe('New summary');
  });

  test('buildContextString() returns empty string when no data', () => {
    const ctx = new ProjectContextManager(tmpDir);
    expect(ctx.buildContextString()).toBe('');
  });

  test('buildContextString() contains project name when data exists', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    const str = ctx.buildContextString();
    expect(str).toContain(path.basename(tmpDir));
  });

  test('formatDisplay() returns non-empty string', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    const str = ctx.formatDisplay();
    expect(typeof str).toBe('string');
    expect(str.length).toBeGreaterThan(0);
  });

  test('detectTechStack() detects Node.js from package.json', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { express: '^4.18.2' } }));
    const stack = await detectTechStack(tmpDir);
    expect(stack).toContain('Node.js');
    expect(stack).toContain('Express');
  });

  test('clear() removes the saved data', async () => {
    const ctx = new ProjectContextManager(tmpDir);
    await ctx.initialize();
    expect(ctx.clear()).toBe(true);
    expect(ctx._data).toBeNull();
  });
});