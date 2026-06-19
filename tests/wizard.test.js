// tests/wizard.test.js — Test suite for Forge Agent Config Wizard
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Wizard, WIZARD_STEPS } = require('../src/wizard');

const TMP_DIR = path.join(os.tmpdir(), `forge-wizard-test-${Date.now()}`);
const TEST_CONFIG_FILE = path.join(TMP_DIR, 'config.json');

describe('Config Wizard', () => {
  let wizard;

  beforeEach(() => {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    wizard = new Wizard(TEST_CONFIG_FILE);
  });

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('Wizard constructor accepts custom config path', () => {
    expect(wizard.configPath).toBe(TEST_CONFIG_FILE);
  });

  test('parseValue converts boolean strings correctly', () => {
    expect(wizard.parseValue('y', 'boolean')).toBe(true);
    expect(wizard.parseValue('yes', 'boolean')).toBe(true);
    expect(wizard.parseValue('true', 'boolean')).toBe(true);
    expect(wizard.parseValue('1', 'boolean')).toBe(true);
    expect(wizard.parseValue('n', 'boolean')).toBe(false);
    expect(wizard.parseValue('no', 'boolean')).toBe(false);
    expect(wizard.parseValue('false', 'boolean')).toBe(false);
    expect(wizard.parseValue('0', 'boolean')).toBe(false);
    expect(wizard.parseValue('abc', 'boolean')).toBeNull();
  });

  test('parseValue converts number strings correctly', () => {
    expect(wizard.parseValue('42', 'number')).toBe(42);
    expect(wizard.parseValue('3.14', 'number')).toBe(3.14);
    expect(wizard.parseValue('abc', 'number')).toBeNull();
  });

  test('parseValue trims text strings correctly', () => {
    expect(wizard.parseValue('  some text  ', 'text')).toBe('some text');
  });

  test('parseValue matches choice by exact string', () => {
    const choices = ['a', 'b', 'c'];
    expect(wizard.parseValue('b', 'choice', choices)).toBe('b');
    expect(wizard.parseValue('z', 'choice', choices)).toBeNull();
  });

  test('parseValue matches choice by 1-based index', () => {
    const choices = ['first', 'second', 'third'];
    expect(wizard.parseValue('1', 'choice', choices)).toBe('first');
    expect(wizard.parseValue('3', 'choice', choices)).toBe('third');
    expect(wizard.parseValue('0', 'choice', choices)).toBeNull();
    expect(wizard.parseValue('4', 'choice', choices)).toBeNull();
  });

  test('formatConfigForFile applies unit conversions and completion flag', () => {
    const answers = {
      MODEL: 'chatgpt',
      RESPONSE_TIMEOUT: 60
    };
    const formatted = wizard.formatConfigForFile(answers);
    expect(formatted.MODEL).toBe('chatgpt');
    expect(formatted.RESPONSE_TIMEOUT).toBe(60000);
    expect(formatted.WIZARD_COMPLETED).toBe(true);
  });

  test('writeConfig creates directory if it does not exist', () => {
    const nestedPath = path.join(TMP_DIR, 'sub', 'config.json');
    const nestedWizard = new Wizard(nestedPath);
    const result = nestedWizard.writeConfig({ test: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  test('writeConfig writes valid JSON to the path', () => {
    const data = { MODEL: 'deepseek', MAX_ITERATIONS: 50 };
    wizard.writeConfig(data);
    const content = JSON.parse(fs.readFileSync(TEST_CONFIG_FILE, 'utf8'));
    expect(content).toEqual(data);
  });

  test('readExistingConfig returns empty object for missing file', () => {
    expect(wizard.readExistingConfig()).toEqual({});
  });

  test('readExistingConfig returns empty object for corrupt JSON', () => {
    fs.writeFileSync(TEST_CONFIG_FILE, '{ bad json');
    expect(wizard.readExistingConfig()).toEqual({});
  });

  test('WIZARD_STEPS array has exactly 9 steps', () => {
    expect(WIZARD_STEPS.length).toBe(9);
  });

  test('Every step in WIZARD_STEPS has required fields', () => {
    WIZARD_STEPS.forEach(step => {
      expect(step.key).toBeDefined();
      expect(step.question).toBeDefined();
      expect(step.type).toBeDefined();
      expect(step.default).toBeDefined();
    });
  });

  test('Every choice type step has non-empty choices array', () => {
    WIZARD_STEPS.filter(s => s.type === 'choice').forEach(step => {
      expect(Array.isArray(step.choices)).toBe(true);
      expect(step.choices.length).toBeGreaterThan(0);
    });
  });

  test('Every number type step has a validate function', () => {
    WIZARD_STEPS.filter(s => s.type === 'number').forEach(step => {
      expect(typeof step.validate).toBe('function');
    });
  });
});
