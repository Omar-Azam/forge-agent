// tests/final-audit.test.js — Final system-wide integrity checks
'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

describe('Final Audit — System Integrity', () => {

  // ── Core Module Loading ───────────────────────────────────────────────────

  test('require("./src/agent") does not throw', () => {
    expect(() => require('../src/agent')).not.toThrow();
  });

  test('require("./src/tools") does not throw', () => {
    expect(() => require('../src/tools')).not.toThrow();
  });

  test('require("./src/config") does not throw', () => {
    expect(() => require('../src/config')).not.toThrow();
  });

  test('require("./src/parser") does not throw', () => {
    expect(() => require('../src/parser')).not.toThrow();
  });

  test('require("./src/browser") does not throw', () => {
    expect(() => require('../src/browser')).not.toThrow();
  });

  test('require("./src/errors") does not throw', () => {
    expect(() => require('../src/errors')).not.toThrow();
  });

  test('require("./src/retry") does not throw', () => {
    expect(() => require('../src/retry')).not.toThrow();
  });

  test('require("./src/health") does not throw', () => {
    expect(() => require('../src/health')).not.toThrow();
  });

  test('require("./src/memory") does not throw', () => {
    expect(() => require('../src/memory')).not.toThrow();
  });

  test('require("./src/history") does not throw', () => {
    expect(() => require('../src/history')).not.toThrow();
  });

  test('require("./src/security") does not throw', () => {
    expect(() => require('../src/security')).not.toThrow();
  });

  // ── Version Consistency ────────────────────────────────────────────────────

  test('package.json version is a valid semver string', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('package.json name is "@omar-azam/forge-agent"', () => {
    expect(pkg.name).toBe('@omar-azam/forge-agent');
  });

  test('package.json bin has "forge-agent" key', () => {
    expect(pkg.bin['forge-agent']).toBeDefined();
  });

  test('package.json bin has "fa" key', () => {
    expect(pkg.bin.fa).toBeDefined();
  });

  // ── Tools Completeness ─────────────────────────────────────────────────────

  test('TOOLS has at least 37 entries', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(37);
  });

  test('Every tool has a description string', () => {
    const { TOOLS } = require('../src/tools');
    Object.values(TOOLS).forEach(tool => {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    });
  });

  test('Every tool has an execute function', () => {
    const { TOOLS } = require('../src/tools');
    Object.values(TOOLS).forEach(tool => {
      expect(typeof tool.execute).toBe('function');
    });
  });

  test('No tool name contains uppercase letters or spaces', () => {
    const { TOOLS } = require('../src/tools');
    Object.keys(TOOLS).forEach(name => {
      expect(name).toMatch(/^[a-z0-9_]+$/);
    });
  });

  // ── Config Completeness ────────────────────────────────────────────────────

  test('config.RESPONSE_TIMEOUT is a number', () => {
    const config = require('../src/config');
    expect(typeof config.RESPONSE_TIMEOUT).toBe('number');
  });

  test('config.WORKING_DIR is a string', () => {
    const config = require('../src/config');
    expect(typeof config.WORKING_DIR).toBe('string');
  });

  test('config.MODEL is a string', () => {
    const config = require('../src/config');
    expect(typeof config.MODEL).toBe('string');
  });

  // ── Community Files ────────────────────────────────────────────────────────

  const root = path.join(__dirname, '..');
  
  test('CONTRIBUTING.md exists and has content', () => {
    const content = fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('CODE_OF_CONDUCT.md exists and has content', () => {
    const content = fs.readFileSync(path.join(root, 'CODE_OF_CONDUCT.md'), 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('SECURITY.md exists and has content', () => {
    const content = fs.readFileSync(path.join(root, 'SECURITY.md'), 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('ROADMAP.md exists and has content', () => {
    const content = fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('LICENSE exists and has content', () => {
    const content = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('CHANGELOG.md exists and has content', () => {
    const content = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  // ── Key Exports ────────────────────────────────────────────────────────────

  test('src/errors.js exports AgentError class', () => {
    const { AgentError } = require('../src/errors');
    expect(typeof AgentError).toBe('function');
  });

  test('src/errors.js exports Errors object', () => {
    const { Errors } = require('../src/errors');
    expect(typeof Errors).toBe('object');
  });

  test('src/retry.js exports sleep function', () => {
    const { sleep } = require('../src/retry');
    expect(typeof sleep).toBe('function');
  });

  test('src/security.js exports validatePath function', () => {
    const { validatePath } = require('../src/security');
    expect(typeof validatePath).toBe('function');
  });

  test('src/security.js exports BLOCKED_PATHS array', () => {
    const { BLOCKED_PATHS } = require('../src/security');
    expect(Array.isArray(BLOCKED_PATHS)).toBe(true);
  });

  test('src/profiles.js exports SUPPORTED_PROFILES array', () => {
    const { SUPPORTED_PROFILES } = require('../src/profiles');
    expect(Array.isArray(SUPPORTED_PROFILES)).toBe(true);
  });

  test('src/templates.js exports BUILT_IN_TEMPLATES array', () => {
    const { BUILT_IN_TEMPLATES } = require('../src/templates');
    expect(Array.isArray(BUILT_IN_TEMPLATES)).toBe(true);
  });

  test('src/examples.js exports EXAMPLES array', () => {
    const { EXAMPLES } = require('../src/examples');
    expect(Array.isArray(EXAMPLES)).toBe(true);
  });

});