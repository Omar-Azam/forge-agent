// tests/templates.test.js — Test suite for Forge Agent Task Templates
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { TemplateStore, BUILT_IN_TEMPLATES } = require('../src/templates');

const TEST_TEMPLATES_FILE = path.join(os.tmpdir(), `forge-templates-test-${Date.now()}.json`);

describe('Task Template System', () => {
  let store;

  beforeEach(() => {
    if (fs.existsSync(TEST_TEMPLATES_FILE)) fs.unlinkSync(TEST_TEMPLATES_FILE);
    store = new TemplateStore(TEST_TEMPLATES_FILE);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_TEMPLATES_FILE)) fs.unlinkSync(TEST_TEMPLATES_FILE);
  });

  test('BUILT_IN_TEMPLATES array has exactly 10 templates', () => {
    expect(Object.keys(BUILT_IN_TEMPLATES).length).toBe(10);
  });

  test('Every built-in template has required fields', () => {
    Object.values(BUILT_IN_TEMPLATES).forEach(t => {
      expect(t.name).toBeDefined();
      expect(t.description).toBeDefined();
      expect(t.task).toBeDefined();
      expect(t.profile).toBeDefined();
      expect(t.tags).toBeDefined();
    });
  });

  test('Every built-in template name matches allowed pattern', () => {
    Object.keys(BUILT_IN_TEMPLATES).forEach(name => {
      expect(name).toMatch(/^[a-z0-9-]+$/);
    });
  });

  test('Every built-in template has a non-empty task string', () => {
    Object.values(BUILT_IN_TEMPLATES).forEach(t => {
      expect(t.task.length).toBeGreaterThan(50);
    });
  });

  test('getBuiltIn returns correct template', () => {
    const t = store.getBuiltIn('add-typescript');
    expect(t).not.toBeNull();
    expect(t.name).toBe('add-typescript');
  });

  test('getBuiltIn returns null for unknown name', () => {
    expect(store.getBuiltIn('nonexistent')).toBeNull();
  });

  test('getCustom returns null when templates file is empty', () => {
    expect(store.getCustom('any')).toBeNull();
  });

  test('get tries custom before built-in', () => {
    // Add custom template with same name as built-in should fail
    // So create a new name for custom.
    store.add('my-custom', 'custom task');
    expect(store.get('my-custom').task).toBe('custom task');
  });

  test('get returns null when template does not exist', () => {
    expect(store.get('nonexistent')).toBeNull();
  });

  test('listAll includes built-in and custom templates', () => {
    store.add('custom-1', 'task');
    const all = store.listAll();
    expect(all.length).toBe(11); // 10 built-in + 1 custom
  });

  test('listAll is sorted alphabetically by name', () => {
    store.add('b-custom', 'task');
    store.add('a-custom', 'task');
    const all = store.listAll();
    // Names: add-auth, add-docker... a-custom, add-typescript... b-custom
    expect(all[0].name).toBe('a-custom');
    expect(all[1].name).toBe('add-auth');
  });

  test('listByTag returns matching templates', () => {
    const ts = store.listByTag('typescript');
    expect(ts.length).toBeGreaterThan(0);
    expect(ts[0].tags).toContain('typescript');
  });

  test('listByTag is case-insensitive', () => {
    const ts = store.listByTag('TYPESCRIPT');
    expect(ts.length).toBeGreaterThan(0);
  });

  test('search returns templates matching name substring', () => {
    const results = store.search('docker');
    expect(results[0].name).toBe('add-docker');
  });

  test('search returns templates matching description', () => {
    const results = store.search('Jest testing framework');
    expect(results[0].name).toBe('add-jest');
  });

  test('add saves custom template successfully', () => {
    store.add('new-template', 'task content', { description: 'desc' });
    expect(store.getCustom('new-template')).not.toBeNull();
  });

  test('add returns error for invalid name (uppercase)', () => {
    const result = store.add('MyTemplate', 'task');
    expect(result.success).toBe(false);
  });

  test('add returns error for invalid name (spaces)', () => {
    const result = store.add('my template', 'task');
    expect(result.success).toBe(false);
  });

  test('add returns error when name conflicts with built-in', () => {
    const result = store.add('add-typescript', 'new task');
    expect(result.success).toBe(false);
  });

  test('remove deletes custom template', () => {
    store.add('temp', 'task');
    store.remove('temp');
    expect(store.getCustom('temp')).toBeNull();
  });

  test('remove returns error when removing built-in', () => {
    const result = store.remove('add-typescript');
    expect(result.removed).toBe(false);
  });

  test('resolveTask substitutes {{variables}}', () => {
    store.add('var-template', 'Hello {{name}}!');
    const task = store.resolveTask('var-template', { name: 'World' });
    expect(task).toBe('Hello World!');
  });

  test('resolveTask leaves task unchanged if no variables', () => {
    const task = store.resolveTask('add-typescript', {});
    expect(task).toContain('Add TypeScript');
  });

  test('resolveTask handles multiple variables', () => {
    store.add('multi-var', '{{a}} + {{b}}');
    const task = store.resolveTask('multi-var', { a: '1', b: '2' });
    expect(task).toBe('1 + 2');
  });

  test('formatTemplate returns non-empty string', () => {
    const t = store.getBuiltIn('add-typescript');
    expect(store.formatTemplate(t).length).toBeGreaterThan(0);
  });

  test('incrementUseCount increases count', () => {
    store.add('test', 'task');
    store.incrementUseCount('test');
    expect(store.getCustom('test').useCount).toBe(1);
  });
});
