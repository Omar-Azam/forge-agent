// tests/adapters.test.js — Model adapter unit tests
'use strict';

const BaseAdapter = require('../src/adapters/base-adapter');
const DeepSeekAdapter = require('../src/adapters/deepseek-adapter');
const GeminiAdapter = require('../src/adapters/gemini-adapter');
const { getAdapter, getModelUrl, getModelDisplayName, SUPPORTED_MODELS } = require('../src/adapter-factory');

const mockPage = {
  waitForSelector: jest.fn(),
  $: jest.fn().mockResolvedValue(null),
  $$: jest.fn().mockResolvedValue([]),
  goto: jest.fn().mockResolvedValue(null),
  waitForTimeout: jest.fn().mockResolvedValue(null),
  keyboard: { press: jest.fn(), type: jest.fn() },
  evaluate: jest.fn().mockResolvedValue(null),
  screenshot: jest.fn().mockResolvedValue(null),
  url: jest.fn().mockReturnValue('https://chat.deepseek.com'),
};

const mockConfig = { 
  STABLE_DELAY: 1500, 
  RESPONSE_TIMEOUT: 60000, 
  GENERATION_POLL: 400, 
  SEND_DELAY: 600, 
  BROWSER_TIMEOUT: 30000 
};

describe('Model Adapters', () => {

  describe('BaseAdapter', () => {
    test('throws when calling abstract methods directly', async () => {
      const base = new BaseAdapter(mockPage, mockConfig);
      expect(() => base._getInputSelectors()).toThrow();
      expect(() => base._getSendSelectors()).toThrow();
      await expect(base.sendMessage('hi')).rejects.toThrow();
    });

    test('_cleanText handles various inputs', () => {
      const base = new BaseAdapter(mockPage, mockConfig);
      expect(base._cleanText(null)).toBe('');
      expect(base._cleanText(undefined)).toBe('');
      expect(base._cleanText('<think>reasoning</think>hello')).toBe('hello');
      expect(base._cleanText('Assistant: hello')).toBe('hello');
      expect(base._cleanText('DeepSeek: hello')).toBe('hello');
      expect(base._cleanText('line 1\n\n\nline 2')).toBe('line 1\n\nline 2');
      expect(base._cleanText('some code\nCopy code')).toBe('some code');
    });

    test('_trySelectors returns null when all fail', async () => {
      const base = new BaseAdapter(mockPage, mockConfig);
      mockPage.waitForSelector.mockRejectedValue(new Error('not found'));
      const el = await base._trySelectors(['.a', '.b'], { timeout: 100 });
      expect(el).toBeNull();
    });

    test('_trySelectors returns element on success', async () => {
      const base = new BaseAdapter(mockPage, mockConfig);
      const mockEl = { isVisible: jest.fn().mockResolvedValue(true) };
      mockPage.waitForSelector.mockResolvedValue(mockEl);
      const el = await base._trySelectors(['.a'], { timeout: 100 });
      expect(el).toBe(mockEl);
    });
  });

  describe('DeepSeekAdapter', () => {
    let adapter;
    beforeEach(() => { adapter = new DeepSeekAdapter(mockPage, mockConfig); });

    test('instantiates with ThinkingTracker', () => {
      expect(adapter.thinkingTracker).toBeDefined();
    });

    test('returns correct selector lists', () => {
      expect(adapter._getInputSelectors().length).toBeGreaterThanOrEqual(5);
      expect(adapter._getSendSelectors().length).toBeGreaterThanOrEqual(3);
      expect(adapter._getStopSelectors().length).toBeGreaterThanOrEqual(3);
      expect(adapter._getNewChatSelectors().length).toBeGreaterThanOrEqual(3);
      expect(adapter._getResponseSelectors().length).toBeGreaterThanOrEqual(3);
    });

    test('getModelUrl is correct', () => {
      expect(adapter.getModelUrl()).toBe('https://chat.deepseek.com');
    });
  });

  describe('GeminiAdapter', () => {
    let adapter;
    beforeEach(() => { adapter = new GeminiAdapter(mockPage, mockConfig); });

    test('includes rich-textarea selectors', () => {
      const inputs = adapter._getInputSelectors();
      expect(inputs.some(s => s.includes('rich-textarea'))).toBe(true);
      expect(inputs.some(s => s.includes('.ql-editor'))).toBe(true);
    });

    test('returns correct URL', () => {
      expect(adapter.getModelUrl()).toBe('https://gemini.google.com/app');
    });
  });

  describe('AdapterFactory', () => {
    test('getAdapter returns correct instances', () => {
      expect(getAdapter('deepseek', mockPage, mockConfig)).toBeInstanceOf(DeepSeekAdapter);
      expect(getAdapter('gemini', mockPage, mockConfig)).toBeInstanceOf(GeminiAdapter);
    });

    test('handles aliases', () => {
      expect(getAdapter('google', mockPage, mockConfig)).toBeInstanceOf(GeminiAdapter);
      expect(getAdapter('bard', mockPage, mockConfig)).toBeInstanceOf(GeminiAdapter);
      expect(getAdapter('r1', mockPage, mockConfig)).toBeInstanceOf(DeepSeekAdapter);
    });

    test('is case insensitive', () => {
      expect(getAdapter('GEMINI', mockPage, mockConfig)).toBeInstanceOf(GeminiAdapter);
    });

    test('throws on unknown model', () => {
      expect(() => getAdapter('skynet', mockPage, mockConfig)).toThrow(/Unknown model/);
    });

    test('throws on chatgpt with helpful message', () => {
      expect(() => getAdapter('chatgpt', mockPage, mockConfig)).toThrow(/currently disabled/);
      expect(() => getAdapter('gpt', mockPage, mockConfig)).toThrow(/currently disabled/);
    });

    test('returns default when null', () => {
      expect(getAdapter(null, mockPage, mockConfig)).toBeInstanceOf(DeepSeekAdapter);
    });

    test('getModelUrl returns correct strings', () => {
      expect(getModelUrl('deepseek')).toBe('https://chat.deepseek.com');
      expect(getModelUrl('gemini')).toBe('https://gemini.google.com/app');
    });

    test('getModelDisplayName returns human strings', () => {
      expect(getModelDisplayName('deepseek')).toBe('DeepSeek');
      expect(getModelDisplayName('gemini')).toBe('Gemini');
      expect(getModelDisplayName('unknown')).toBe('unknown');
    });

    test('SUPPORTED_MODELS is exported and complete', () => {
      expect(SUPPORTED_MODELS).toContain('deepseek');
      expect(SUPPORTED_MODELS).toContain('gemini');
      expect(SUPPORTED_MODELS).not.toContain('chatgpt');
      expect(SUPPORTED_MODELS.length).toBe(2);
    });
  });

});