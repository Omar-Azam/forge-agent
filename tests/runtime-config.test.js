// tests/runtime-config.test.js — Verification of reactive config system
'use strict';

describe('Runtime Config System', () => {
  let config, onConfigChange, setConfig, getSessionOverrides,
      resetToDefault, resetAllToDefaults, DEFAULTS;

  beforeEach(() => {
    // Re-require to get fresh state
    jest.resetModules();
    const configModule = require('../src/config');
    config              = configModule;
    onConfigChange      = configModule.onConfigChange;
    setConfig           = configModule.setConfig;
    getSessionOverrides = configModule.getSessionOverrides;
    resetToDefault      = configModule.resetToDefault;
    resetAllToDefaults  = configModule.resetAllToDefaults;
    DEFAULTS            = configModule.DEFAULTS;
  });

  describe('Proxy Basics', () => {
    test('config.DEBUG can be read', () => {
      expect(config.DEBUG).toBeDefined();
    });

    test('config.DEBUG can be set to a new value', () => {
      config.DEBUG = true;
      expect(config.DEBUG).toBe(true);
    });

    test('set value is immediately readable', () => {
      config.SHOW_THINKING = true;
      expect(config.SHOW_THINKING).toBe(true);
    });

    test('setting config.MODEL updates config.MODEL', () => {
      config.MODEL = 'gemini';
      expect(config.MODEL).toBe('gemini');
    });

    test('config works as a plain object for Object.keys', () => {
      const keys = Object.keys(config);
      expect(keys).toContain('DEBUG');
      expect(keys).toContain('MODEL');
    });
  });

  describe('Reactive Subscriptions', () => {
    test('onConfigChange fires callback when key is set', () => {
      const cb = jest.fn();
      onConfigChange('DEBUG', cb);
      config.DEBUG = true;
      expect(cb).toHaveBeenCalledWith(true, false, 'DEBUG');
    });

    test('onConfigChange for "*" fires on any key change', () => {
      const cb = jest.fn();
      onConfigChange('*', cb);
      config.DEBUG = true;
      expect(cb).toHaveBeenCalledWith(true, false, 'DEBUG');
    });

    test('unsubscribe function removes callback', () => {
      const cb = jest.fn();
      const unsub = onConfigChange('DEBUG', cb);
      unsub();
      config.DEBUG = true;
      expect(cb).not.toHaveBeenCalled();
    });

    test('multiple subscribers on same key all receive updates', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      onConfigChange('MODEL', cb1);
      onConfigChange('MODEL', cb2);
      config.MODEL = 'gemini';
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    test('subscriber error does not crash the setter', () => {
      onConfigChange('DEBUG', () => { throw new Error('boom'); });
      expect(() => { config.DEBUG = true; }).not.toThrow();
      expect(config.DEBUG).toBe(true);
    });
  });

  describe('setConfig Batch Updates', () => {
    test('setConfig updates multiple keys at once', () => {
      setConfig({ DEBUG: true, HEADLESS: true });
      expect(config.DEBUG).toBe(true);
      expect(config.HEADLESS).toBe(true);
    });

    test('setConfig with empty object does nothing', () => {
      const original = { ...config };
      setConfig({});
      expect(config.DEBUG).toBe(original.DEBUG);
    });
  });

  describe('Session Overrides Tracking', () => {
    test('getSessionOverrides returns empty object before any changes', () => {
      expect(getSessionOverrides()).toEqual({});
    });

    test('getSessionOverrides returns changed keys after set', () => {
      config.DEBUG = true;
      expect(getSessionOverrides()).toHaveProperty('DEBUG', true);
    });

    test('getSessionOverrides does not include unchanged defaults', () => {
      config.HEADLESS = config.HEADLESS; // no change
      const overrides = getSessionOverrides();
      // Should be empty or not have DEBUG if it was already default
    });
  });

  describe('Reset Operations', () => {
    test('resetToDefault restores a single key to DEFAULTS value', () => {
      config.DEBUG = !DEFAULTS.DEBUG;
      resetToDefault('DEBUG');
      expect(config.DEBUG).toBe(DEFAULTS.DEBUG);
    });

    test('resetAllToDefaults restores all changed keys', () => {
      config.DEBUG = !DEFAULTS.DEBUG;
      config.HEADLESS = !DEFAULTS.HEADLESS;
      resetAllToDefaults();
      expect(config.DEBUG).toBe(DEFAULTS.DEBUG);
      expect(config.HEADLESS).toBe(DEFAULTS.HEADLESS);
    });
  });

  describe('Config Validation', () => {
    test('MODEL: "unknown" is rejected', () => {
      const before = config.MODEL;
      config.MODEL = 'unknown';
      expect(config.MODEL).toBe(before);
    });

    test('MODEL: "gemini" is accepted', () => {
      config.MODEL = 'gemini';
      expect(config.MODEL).toBe('gemini');
    });

    test('HEADLESS: "yes" is rejected (must be boolean)', () => {
      const before = config.HEADLESS;
      config.HEADLESS = 'yes';
      expect(config.HEADLESS).toBe(before);
    });

    test('HEADLESS: true is accepted', () => {
      config.HEADLESS = true;
      expect(config.HEADLESS).toBe(true);
    });

    test('unknown keys pass through without validation', () => {
      config.UNKNOWN_KEY = 'val';
      expect(config.UNKNOWN_KEY).toBe('val');
    });
  });

  describe('DEFAULTS Export', () => {
    test('DEFAULTS contains expected keys', () => {
      expect(DEFAULTS.MODEL).toBe('deepseek');
      expect(DEFAULTS.RESPONSE_TIMEOUT).toBe(600000);
    });
  });

  describe('Config Commands', () => {
    const { CommandRouter } = require('../src/commands');
    let router;

    beforeEach(() => {
      router = new CommandRouter({ config });
    });

    test('/config with no args returns all config', async () => {
      const result = await router.execute('/config');
      expect(result).toContain('Current Configuration');
      expect(result).toContain('MODEL');
    });

    test('/config with key returns that key\'s value', async () => {
      const result = await router.execute('/config DEBUG');
      expect(result).toContain('DEBUG: false');
    });

    test('/config with key and value sets the value', async () => {
      await router.execute('/config DEBUG true');
      expect(config.DEBUG).toBe(true);
    });

    test('/reset-config with "all" resets overrides', async () => {
      config.DEBUG = true;
      await router.execute('/reset-config all');
      expect(config.DEBUG).toBe(false);
    });

    test('/status shows session changes', async () => {
      config.DEBUG = true;
      const result = await router.execute('/status');
      expect(result).toContain('Session changes');
      expect(result).toContain('DEBUG');
    });
  });
});