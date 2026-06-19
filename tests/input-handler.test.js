// tests/input-handler.test.js — Multi-line input handler tests
'use strict';

const { 
  InputHandler, 
  runInteractiveLoop, 
  PASTE_BURST_THRESHOLD_MS, 
  LARGE_INPUT_THRESHOLD 
} = require('../src/input-handler');

// Mock readline
const readline = require('readline');
jest.mock('readline');

describe('InputHandler', () => {
  let mockRl;

  beforeEach(() => {
    mockRl = {
      on: jest.fn(),
      close: jest.fn(),
      write: jest.fn(),
    };
    readline.createInterface.mockReturnValue(mockRl);
  });

  describe('Constants', () => {
    test('PASTE_BURST_THRESHOLD_MS is valid', () => {
      expect(PASTE_BURST_THRESHOLD_MS).toBeGreaterThan(0);
      expect(PASTE_BURST_THRESHOLD_MS).toBeLessThan(200);
    });

    test('LARGE_INPUT_THRESHOLD is valid', () => {
      expect(LARGE_INPUT_THRESHOLD).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Instantiation', () => {
    test('uses default prompt', () => {
      const handler = new InputHandler();
      expect(handler.prompt).toContain('❯');
    });

    test('accepts custom prompt', () => {
      const handler = new InputHandler({ prompt: '> ' });
      expect(handler.prompt).toBe('> ');
    });

    test('has public methods', () => {
      const handler = new InputHandler();
      expect(typeof handler.collect).toBe('function');
      expect(typeof handler.close).toBe('function');
    });
  });

  describe('Logic', () => {
    test('close() handles non-existent readline', () => {
      const handler = new InputHandler();
      expect(() => handler.close()).not.toThrow();
    });

    test('close() closes active readline', () => {
      const handler = new InputHandler();
      handler._rl = mockRl;
      handler.close();
      expect(mockRl.close).toHaveBeenCalled();
    });
  });

});

describe('runInteractiveLoop', () => {
  test('exports as function', () => {
    expect(typeof runInteractiveLoop).toBe('function');
  });

  // More complex tests would involve full InputHandler mocking
});
