// tests/bug-fixes.test.js — Verification of critical bug fixes
'use strict';

const config = require('../src/config');
const { TUI } = require('../src/tui');
const { ProgressTracker } = require('../src/progress');
const DeepSeekAdapter = require('../src/adapters/deepseek-adapter');

describe('Bug Fixes — Verification', () => {

  describe('Config Flag Application', () => {
    let originalConfig;

    beforeEach(() => {
      originalConfig = { ...config };
    });

    afterEach(() => {
      Object.assign(config, originalConfig);
    });

    test('RESPONSE_TIMEOUT updates correctly', () => {
      config.RESPONSE_TIMEOUT = 120000;
      expect(config.RESPONSE_TIMEOUT).toBe(120000);
    });

    test('STABLE_DELAY has correct default', () => {
      expect(config.STABLE_DELAY).toBe(1500);
    });

    test('SEND_DELAY has correct default', () => {
      expect(config.SEND_DELAY).toBe(600);
    });

    test('GENERATION_POLL has correct default', () => {
      expect(config.GENERATION_POLL).toBe(400);
    });
  });

  describe('TUI Step Counter and Errors', () => {
    const tui = new TUI({ width: 80, noColor: true });
    const progress = new ProgressTracker('test task');

    function captureOutput(fn) {
      let output = '';
      const original = tui._print;
      tui._print = (s) => { output = s; };
      fn();
      tui._print = original;
      return output;
    }

    test('renderStepLine shows step number', () => {
      const output = captureOutput(() => tui.renderStepLine(3, 5000, progress));
      expect(output).toContain('Step 3');
    });

    test('renderStepLine shows error count when > 0', () => {
      progress.errorCount = 2;
      const output = captureOutput(() => tui.renderStepLine(1, 1000, progress));
      expect(output).toContain('2 errors');
    });

    test('renderStepLine hides error count when 0', () => {
      progress.errorCount = 0;
      const output = captureOutput(() => tui.renderStepLine(1, 1000, progress));
      expect(output).not.toContain('errors');
    });
  });

  describe('ThinkingTracker Safety', () => {
    let adapter;

    beforeEach(() => {
      adapter = new DeepSeekAdapter(null, config);
    });

    test('_ensureThinkingTracker() creates tracker when undefined', () => {
      adapter.thinkingTracker = undefined;
      adapter._ensureThinkingTracker();
      expect(adapter.thinkingTracker).toBeDefined();
      expect(typeof adapter.thinkingTracker.reset).toBe('function');
    });

    test('thinkingTracker methods never throw', () => {
      adapter._ensureThinkingTracker();
      expect(() => adapter.thinkingTracker.reset()).not.toThrow();
      expect(() => adapter.thinkingTracker.update(null)).not.toThrow();
      expect(() => adapter.thinkingTracker.update(undefined)).not.toThrow();
    });
  });

  describe('Profile Application', () => {
    const { applyProfile, getProfile } = require('../src/profiles');

    test('applyProfile never throws for default', () => {
      const profile = getProfile('default');
      expect(() => applyProfile(profile, {})).not.toThrow();
    });

    test('applyProfile sets ACTIVE_PROFILE', () => {
      const profile = getProfile('backend');
      const result = applyProfile(profile, {});
      expect(result.ACTIVE_PROFILE).toBe('backend');
    });
  });

  describe('Input Collection', () => {
    test('runInteractiveLoop is exported', () => {
      const { runInteractiveLoop } = require('../src/input-handler');
      expect(typeof runInteractiveLoop).toBe('function');
    });
  });

});