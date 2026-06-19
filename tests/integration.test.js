// tests/integration.test.js — Verification of module loading and end-to-end integration
'use strict';

// These tests use real modules — no mocking
// They verify that the actual code paths work end to end

describe('Module loading integration', () => {

  test('All src/ modules load without error', () => {
    const fs    = require('fs');
    const path  = require('path');
    const files = fs.readdirSync('src')
      .filter(f => f.endsWith('.js'))
      .filter(f => !f.includes('postinstall') && !f.includes('calibrate'));

    const errors = [];
    files.forEach(f => {
      try {
        require(path.join(process.cwd(), 'src', f));
      } catch (e) {
        errors.push(`${f}: ${e.message}`);
      }
    });
    expect(errors).toEqual([]);
  });

  test('logger.initTUI does not crash', () => {
    jest.resetModules();
    const logger = require('../src/logger');
    const config = require('../src/config');
    expect(() => logger.initTUI(config)).not.toThrow();
  });

  test('logger.banner does not crash after initTUI', () => {
    jest.resetModules();
    process.env.NO_COLOR = '1';
    const logger = require('../src/logger');
    const config = require('../src/config');
    logger.initTUI(config);
    expect(() => logger.banner()).not.toThrow();
    delete process.env.NO_COLOR;
  });

  test('logger.updateTUIConfig does not crash', () => {
    jest.resetModules();
    const logger = require('../src/logger');
    expect(() => logger.updateTUIConfig({ COMPACT_OUTPUT: true })).not.toThrow();
    expect(() => logger.updateTUIConfig({ DEBUG: true })).not.toThrow();
    expect(() => logger.updateTUIConfig({})).not.toThrow();
  });

  test('logger methods work before initTUI is called', () => {
    jest.resetModules();
    process.env.NO_COLOR = '1';
    const logger = require('../src/logger');
    // All these must work without initTUI being called first
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
    expect(() => logger.dim('test')).not.toThrow();
    delete process.env.NO_COLOR;
  });

  test('config has all required keys', () => {
    jest.resetModules();
    const config = require('../src/config');
    const required = [
      'MODEL', 'RESPONSE_TIMEOUT', 'STABLE_DELAY',
      'SEND_DELAY', 'GENERATION_POLL', 'APPEAR_TIMEOUT', 'BROWSER_TIMEOUT',
      'TOOL_TIMEOUT', 'WORKING_DIR', 'SESSION_DIR', 'HEADLESS', 'DEBUG',
      'NO_TUI', 'COMPACT_OUTPUT', 'MEMORY_ENABLED', 'CACHE_ENABLED',
      'PLANNING_MODE', 'SHOW_THINKING', 'ACTIVE_PROFILE', 'STRICT_SANDBOX',
      'OUTPUT_FORMAT', 'DISABLE_SPONSOR_NUDGE',
    ];
    required.forEach(key => {
      expect(config).toHaveProperty(key);
    });
  });

  test('profiles module exports required symbols', () => {
    const profiles = require('../src/profiles');
    expect(typeof profiles.applyProfile).toBe('function');
    expect(typeof profiles.getProfile).toBe('function');
    expect(Array.isArray(profiles.SUPPORTED_PROFILES)).toBe(true);
    expect(profiles.SUPPORTED_PROFILES.length).toBeGreaterThanOrEqual(5);
  });

  test('applyProfile does not throw for default profile', () => {
    const { applyProfile, getProfile } = require('../src/profiles');
    const config  = require('../src/config');
    const profile = getProfile('default');
    expect(() => applyProfile(profile, { ...config })).not.toThrow();
  });

  test('applyProfile does not throw for all profiles', () => {
    const { applyProfile, getProfile, SUPPORTED_PROFILES } = require('../src/profiles');
    const config = require('../src/config');
    SUPPORTED_PROFILES.forEach(name => {
      const profile = getProfile(name);
      expect(() => applyProfile(profile, { ...config })).not.toThrow();
    });
  });

  test('CommandRouter instantiates without browser', () => {
    const { CommandRouter } = require('../src/commands');
    const config = require('../src/config');
    expect(() => new CommandRouter({ config, agent: null, logger: { dim: () => {}, info: () => {} } })).not.toThrow();
  });

  test('CommandRouter.execute /version does not throw', async () => {
    const { CommandRouter } = require('../src/commands');
    const config = require('../src/config');
    const router = new CommandRouter({ config });
    const result = await router.execute('/version');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('CommandRouter.execute /help does not throw', async () => {
    const { CommandRouter } = require('../src/commands');
    const config = require('../src/config');
    const router = new CommandRouter({ config });
    const result = await router.execute('/help');
    expect(typeof result).toBe('string');
    expect(result).toContain('Slash Commands');
  });

  test('CommandRouter.execute /status does not throw', async () => {
    const { CommandRouter } = require('../src/commands');
    const config = require('../src/config');
    const router = new CommandRouter({ config });
    const result = await router.execute('/status');
    expect(typeof result).toBe('string');
    expect(result).toContain('Model:');
  });

  test('InputHandler instantiates without throwing', () => {
    const { InputHandler } = require('../src/input-handler');
    expect(() => new InputHandler({ prompt: '> ' })).not.toThrow();
  });

  test('diagnostics generateDiagnostics does not throw', () => {
    const { generateDiagnostics } = require('../src/diagnostics');
    expect(() => generateDiagnostics()).not.toThrow();
    const result = generateDiagnostics();
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('node');
  });

  test('security generateSecurityReport does not throw', () => {
    const { generateSecurityReport } = require('../src/security');
    expect(() => generateSecurityReport()).not.toThrow();
  });

  test('docker isRunningInDocker does not throw', () => {
    const { isRunningInDocker } = require('../src/docker');
    expect(() => isRunningInDocker()).not.toThrow();
    expect(typeof isRunningInDocker()).toBe('boolean');
  });

  test('templates BUILT_IN_TEMPLATES has 10 items', () => {
    const { BUILT_IN_TEMPLATES } = require('../src/templates');
    expect(Array.isArray(BUILT_IN_TEMPLATES)).toBe(true);
    expect(BUILT_IN_TEMPLATES.length).toBe(10);
  });

  test('examples EXAMPLES has 10 items', () => {
    const { EXAMPLES } = require('../src/examples');
    expect(Array.isArray(EXAMPLES)).toBe(true);
    expect(EXAMPLES.length).toBe(10);
  });

  test('ProjectContextManager loads without error for temp dir', () => {
    const { ProjectContextManager } = require('../src/project-context');
    const tmp = require('os').tmpdir();
    expect(() => new ProjectContextManager(tmp)).not.toThrow();
  });

  test('buildSystemPrompt does not throw for empty opts', () => {
    const { buildSystemPrompt } = require('../src/system-prompt');
    expect(() => buildSystemPrompt({})).not.toThrow();
  });

  test('adapter factory loads all supported models', () => {
    const { getAdapter, SUPPORTED_MODELS } = require('../src/adapter-factory');
    const mockPage = {
      waitForSelector: jest.fn(), $: jest.fn(), $$: jest.fn(),
      goto: jest.fn(), waitForTimeout: jest.fn(),
      keyboard: { press: jest.fn(), type: jest.fn() },
      evaluate: jest.fn(), screenshot: jest.fn(),
      url: jest.fn().mockReturnValue('https://chat.deepseek.com'),
    };
    const mockConfig = { STABLE_DELAY: 1500, RESPONSE_TIMEOUT: 60000 };
    expect(SUPPORTED_MODELS.length).toBe(2);
    SUPPORTED_MODELS.forEach(model => {
      expect(() => getAdapter(model, mockPage, mockConfig)).not.toThrow();
    });
  });

  test('history HistoryStore instantiates', () => {
    const { HistoryStore } = require('../src/history');
    expect(() => new HistoryStore()).not.toThrow();
  });

  test('memory MemoryStore instantiates', () => {
    const { MemoryStore } = require('../src/memory');
    expect(() => new MemoryStore()).not.toThrow();
  });

  test('sponsor formatNudgeMessage does not throw', () => {
    const { SponsorNudge } = require('../src/sponsor');
    const nudge = new SponsorNudge(null, {});
    expect(() => nudge.formatNudgeMessage()).not.toThrow();
  });
});

describe('CLI flag simulation (no browser)', () => {

  test('--version produces output with version number', () => {
    const pkg = require('../package.json');
    // Simulate what --version does
    const output = `Forge Agent v${pkg.version}`;
    expect(output).toMatch(/Forge Agent v\d+\.\d+\.\d+/);
  });

  test('--list-profiles produces non-empty output', () => {
    const { SUPPORTED_PROFILES } = require('../src/profiles');
    const output = SUPPORTED_PROFILES.join('\n');
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('default');
    expect(output).toContain('backend');
  });

  test('--list-templates produces non-empty output', () => {
    const { BUILT_IN_TEMPLATES } = require('../src/templates');
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThan(0);
  });

  test('--diagnostics produces object with required fields', () => {
    const { generateDiagnostics, formatDiagnostics } = require('../src/diagnostics');
    const report = generateDiagnostics();
    const text   = formatDiagnostics(report);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('Forge Agent');
  });

  test('--security produces non-empty report', () => {
    const { generateSecurityReport, formatSecurityReport } = require('../src/security');
    const report = generateSecurityReport();
    const text   = formatSecurityReport(report);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(50);
  });
});