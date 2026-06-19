// tests/commands.test.js — Slash command system unit tests
'use strict';

const { 
  CommandRouter, 
  findCommand, 
  getAllCommands, 
  BUILT_IN_COMMANDS, 
  registerCommand 
} = require('../src/commands');

const mockConfig = {
  MODEL: 'deepseek', 
  ACTIVE_PROFILE: 'default', 
  RESPONSE_TIMEOUT: 600000, 
  SHOW_THINKING: false, 
  PLANNING_MODE: false,
  MEMORY_ENABLED: true, 
  CACHE_ENABLED: true, 
  NO_TUI: false, 
  DEBUG: false,
  WORKING_DIR: process.cwd(),
};

function makeRouter(configOverrides = {}) {
  return new CommandRouter({
    config: { ...mockConfig, ...configOverrides },
    logger: { dim: jest.fn(), info: jest.fn(), warn: jest.fn() },
    agent: {
      browser: { newChat: jest.fn() },
      conversation: { messages: [], compress: jest.fn() }
    },
    memory: { buildMemoryContext: jest.fn(), clearProjectMemory: jest.fn() },
    history: { getEntries: jest.fn().mockReturnValue([]) }
  });
}

describe('Slash Command System', () => {

  describe('CommandRouter basics', () => {
    const router = makeRouter();

    test('isCommand identifies commands correctly', () => {
      expect(router.isCommand('/think')).toBe(true);
      expect(router.isCommand('/model gemini')).toBe(true);
      expect(router.isCommand('build a REST API')).toBe(false);
      expect(router.isCommand('new')).toBe(false);
      expect(router.isCommand('/')).toBe(false);
      expect(router.isCommand('')).toBe(false);
      expect(router.isCommand(null)).toBe(false);
    });

    test('execute returns null for non-command input', async () => {
      expect(await router.execute('task')).toBeNull();
    });

    test('execute returns error for unknown command', async () => {
      const result = await router.execute('/unknowncommand');
      expect(result).toContain('Unknown command');
      expect(result).toContain('/help');
    });
  });

  describe('Command Finding', () => {
    test('findCommand returns correct commands and aliases', () => {
      expect(findCommand('help').name).toBe('help');
      expect(findCommand('h').name).toBe('help');
      expect(findCommand('?').name).toBe('help');
      expect(findCommand('think').name).toBe('think');
      expect(findCommand('r1').name).toBe('think');
      expect(findCommand('model').name).toBe('model');
    });

    test('findCommand is case-insensitive', () => {
      expect(findCommand('HELP').name).toBe('help');
    });

    test('findCommand returns null for unknown', () => {
      expect(findCommand('skynet')).toBeNull();
    });
  });

  describe('All Commands Registration', () => {
    test('BUILT_IN_COMMANDS and getAllCommands are populated', () => {
      expect(BUILT_IN_COMMANDS.length).toBeGreaterThanOrEqual(10);
      expect(getAllCommands().length).toBeGreaterThanOrEqual(10);
    });

    test('Every command has required fields', () => {
      getAllCommands().forEach(cmd => {
        expect(cmd).toHaveProperty('name');
        expect(cmd).toHaveProperty('description');
        expect(cmd).toHaveProperty('usage');
        expect(cmd).toHaveProperty('category');
        expect(typeof cmd.execute).toBe('function');
        expect(cmd.name).toMatch(/^[a-z-]+$/);
      });
    });
  });

  describe('Slash Command Execution', () => {
    test('/think toggles configuration', async () => {
      const config = { ...mockConfig };
      const router = new CommandRouter({ config });
      
      await router.execute('/think');
      expect(config.SHOW_THINKING).toBe(true);
      await router.execute('/think off');
      expect(config.SHOW_THINKING).toBe(false);
      await router.execute('/think on');
      expect(config.SHOW_THINKING).toBe(true);
    });

    test('/plan toggles planning mode', async () => {
      const config = { ...mockConfig };
      const router = new CommandRouter({ config });
      await router.execute('/plan');
      expect(config.PLANNING_MODE).toBe(true);
    });

    test('/debug toggles debug mode', async () => {
      const config = { ...mockConfig };
      const router = new CommandRouter({ config });
      await router.execute('/debug');
      expect(config.DEBUG).toBe(true);
    });

    test('/timeout sets response timeout', async () => {
      const config = { ...mockConfig };
      const router = new CommandRouter({ config });
      await router.execute('/timeout 300');
      expect(config.RESPONSE_TIMEOUT).toBe(300000);
      await router.execute('/timeout 0');
      expect(config.RESPONSE_TIMEOUT).toBe(0);
    });

    test('/model requires argument', async () => {
      const router = makeRouter();
      const result = await router.execute('/model');
      expect(result).toContain('requires an argument');
    });

    test('/status returns session info', async () => {
      const router = makeRouter();
      const result = await router.execute('/status');
      expect(result).toContain('Session Status');
      expect(result).toContain('Model:');
    });

    test('/version returns version string', async () => {
      const router = makeRouter();
      const result = await router.execute('/version');
      expect(result).toContain('Forge Agent');
    });

    test('/help returns command list', async () => {
      const router = makeRouter();
      const result = await router.execute('/help');
      expect(result).toContain('Slash Commands');
    });
  });

  describe('Custom Command Registration', () => {
    test('registerCommand adds and executes new commands', async () => {
      let called = false;
      registerCommand({
        name: 'testcmd',
        aliases: [],
        description: 'test',
        usage: '/testcmd',
        category: 'Test',
        execute: async () => { called = true; return 'done'; }
      });

      const router = makeRouter();
      const result = await router.execute('/testcmd');
      expect(called).toBe(true);
      expect(result).toBe('done');
      expect(getAllCommands().some(c => c.name === 'testcmd')).toBe(true);
    });

    test('registerCommand throws for invalid command', () => {
      expect(() => registerCommand({ name: '' })).toThrow();
      expect(() => registerCommand({ execute: () => {} })).toThrow();
    });
  });

  describe('Error Handling', () => {
    test('execute catches internal errors', async () => {
      registerCommand({
        name: 'fail',
        aliases: [],
        description: 'fail',
        usage: '/fail',
        category: 'Test',
        execute: async () => { throw new Error('boom'); }
      });
      
      const router = makeRouter();
      const result = await router.execute('/fail');
      expect(result).toContain('❌ /fail failed: boom');
    });
  });

});