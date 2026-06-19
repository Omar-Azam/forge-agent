// tests/plugin-loader.test.js — Plugin loader system tests
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { 
  discoverPlugins, 
  loadPlugin, 
  loadAllPlugins, 
  validatePlugin,
  createPluginStub
} = require('../src/plugin-loader');

const TMP_DIR = path.join(os.tmpdir(), 'dsa-test-plugins-' + Date.now());

describe('Plugin Loader', () => {
  beforeAll(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('discoverPlugins returns empty array for non-existent directory', () => {
    expect(discoverPlugins(path.join(TMP_DIR, 'ghost'))).toEqual([]);
  });

  test('discoverPlugins finds .js files', () => {
    const pluginDir = path.join(TMP_DIR, 'valid');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'p1.js'), '');
    fs.writeFileSync(path.join(pluginDir, 'p2.js'), '');
    
    const plugins = discoverPlugins(pluginDir);
    expect(plugins.length).toBe(2);
    expect(plugins[0]).toContain('p1.js');
  });

  test('discoverPlugins skips files starting with underscore', () => {
    const pluginDir = path.join(TMP_DIR, 'skip');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, '_p1.js'), '');
    
    const plugins = discoverPlugins(pluginDir);
    expect(plugins).toEqual([]);
  });

  test('loadPlugin returns success:false for file missing name', () => {
    const p = path.join(TMP_DIR, 'bad1.js');
    fs.writeFileSync(p, 'module.exports = { description: "x", execute: () => {} }');
    const result = loadPlugin(p);
    expect(result.success).toBe(false);
  });

  test('loadPlugin returns success:true for valid plugin', () => {
    const p = path.join(TMP_DIR, 'good.js');
    fs.writeFileSync(p, 'module.exports = { name: "good", description: "x", execute: async () => {} }');
    const result = loadPlugin(p);
    expect(result.success).toBe(true);
    expect(result.tool.name).toBe('good');
  });

  test('validatePlugin returns valid:true for correct shape', () => {
    const p = { name: 't', description: 'd', execute: () => {} };
    expect(validatePlugin(p).valid).toBe(true);
  });

  test('createPluginStub returns a string containing the name', () => {
    const stub = createPluginStub('test_plugin');
    expect(stub).toContain("name: 'test_plugin'");
  });

  test('discoverPlugins skips non-.js files', () => {
    const pluginDir = path.join(TMP_DIR, 'skip_ext');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'p1.txt'), '');
    
    const plugins = discoverPlugins(pluginDir);
    expect(plugins).toEqual([]);
  });

  test('loadPlugin returns success:false for file missing execute function', () => {
    const p = path.join(TMP_DIR, 'bad2.js');
    fs.writeFileSync(p, 'module.exports = { name: "x", description: "d" }');
    const result = loadPlugin(p);
    expect(result.success).toBe(false);
  });

  test('loadPlugin returns success:false for file with invalid name format', () => {
    const p = path.join(TMP_DIR, 'bad3.js');
    fs.writeFileSync(p, 'module.exports = { name: "Bad Name", description: "d", execute: () => {} }');
    const result = loadPlugin(p);
    expect(result.success).toBe(false);
  });

  test('loadPlugin returns success:false for non-existent file', () => {
    const result = loadPlugin(path.join(TMP_DIR, 'ghost.js'));
    expect(result.success).toBe(false);
  });

  test('loadAllPlugins returns empty loaded array when no plugins exist', () => {
    const pluginDir = path.join(TMP_DIR, 'empty');
    fs.mkdirSync(pluginDir, { recursive: true });
    const { loaded, failed } = loadAllPlugins(pluginDir, []);
    expect(loaded).toEqual([]);
  });

  test('loadAllPlugins handles plugin that throws on require', () => {
    const pluginDir = path.join(TMP_DIR, 'throw');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'throw.js'), 'throw new Error("fail")');
    const { loaded, failed } = loadAllPlugins(pluginDir, []);
    expect(loaded).toEqual([]);
    expect(failed.length).toBe(1);
  });

  test('loadPlugin loaded tool has correct name and description', () => {
    const p = path.join(TMP_DIR, 'meta.js');
    fs.writeFileSync(p, 'module.exports = { name: "n", description: "d", execute: async () => {} }');
    const result = loadPlugin(p);
    expect(result.tool.name).toBe('n');
    expect(result.tool.description).toBe('d');
  });

  test('loadPlugin loaded tool execute is a function', () => {
    const p = path.join(TMP_DIR, 'func.js');
    fs.writeFileSync(p, 'module.exports = { name: "n", description: "d", execute: async () => {} }');
    const result = loadPlugin(p);
    expect(typeof result.tool.execute).toBe('function');
  });

  test('validatePlugin returns valid:false for missing name', () => {
    const p = { description: 'd', execute: () => {} };
    expect(validatePlugin(p).valid).toBe(false);
  });

  test('validatePlugin returns valid:false for missing execute', () => {
    const p = { name: 'n', description: 'd' };
    expect(validatePlugin(p).valid).toBe(false);
  });
});
