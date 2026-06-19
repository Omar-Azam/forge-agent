// tests/compressor.test.js — Day 22: Context compressor tests
'use strict';

const { 
  estimateTokenCount, 
  extractSummaryFacts, 
  buildSummaryMessage, 
  shouldCompress, 
  compressConversation 
} = require('../src/compressor');
const { ConversationManager } = require('../src/prompt');
const config = require('../src/config');

describe('Compressor Module', () => {

  describe('estimateTokenCount', () => {
    test('returns a positive number for non-empty string', () => {
      expect(estimateTokenCount('hello world')).toBeGreaterThan(0);
    });

    test('returns 0 for empty string', () => {
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount(null)).toBe(0);
    });

    test('scales with string length', () => {
      const short = estimateTokenCount('abc');
      const long = estimateTokenCount('abcdef');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('extractSummaryFacts', () => {
    test('finds file paths from tool results', () => {
      const messages = [
        { content: '✓ Wrote 123 B (3 lines) → src/index.js' },
        { content: '{"name": "write_file", "args": {"path": "src/utils.js"}}' }
      ];
      const facts = extractSummaryFacts(messages);
      expect(facts.filesWritten).toContain('src/index.js');
      expect(facts.filesWritten).toContain('src/utils.js');
    });

    test('finds commands from results', () => {
      const messages = [
        { content: '{"name": "run_command", "args": {"command": "npm install"}}' }
      ];
      const facts = extractSummaryFacts(messages);
      expect(facts.commandsRun).toContain('npm install');
    });

    test('finds tool names used', () => {
      const messages = [
        { content: '[TOOL RESULT: read_file | SUCCESS]' },
        { content: '```tool_call\n{"name": "git_status"}\n```' }
      ];
      const facts = extractSummaryFacts(messages);
      expect(facts.toolsUsed).toContain('read_file');
      expect(facts.toolsUsed).toContain('git_status');
    });

    test('extracts error messages', () => {
      const messages = [
        { content: '[TOOL RESULT: run_tests | ERROR]\nError: tests failed\nReason: process exit 1' }
      ];
      const facts = extractSummaryFacts(messages);
      expect(facts.errors[0]).toBe('Error: tests failed');
    });

    test('returns empty arrays for empty messages', () => {
      const facts = extractSummaryFacts([]);
      expect(facts.filesWritten).toEqual([]);
      expect(facts.commandsRun).toEqual([]);
      expect(facts.toolsUsed).toEqual([]);
    });
  });

  describe('shouldCompress', () => {
    test('returns false when under threshold', () => {
      const messages = [{ content: 'small' }];
      expect(shouldCompress(messages, 1000)).toBe(false);
    });

    test('returns true when over threshold', () => {
      const messages = [{ content: 'a'.repeat(500) }]; // ~125 tokens
      expect(shouldCompress(messages, 100)).toBe(true);
    });
  });

  describe('compressConversation', () => {
    test('keeps first message (system prompt) intact', () => {
      const messages = [
        { role: 'user', content: 'SYSTEM' },
        { role: 'assistant', content: '1' },
        { role: 'user', content: '2' },
        { role: 'assistant', content: '3' },
        { role: 'user', content: '4' },
        { role: 'assistant', content: '5' },
        { role: 'user', content: '6' },
        { role: 'assistant', content: '7' },
        { role: 'user', content: '8' }
      ];
      const compressed = compressConversation(messages, { keepRecent: 4 });
      expect(compressed[0].content).toBe('SYSTEM');
    });

    test('keeps last messages intact', () => {
      const messages = Array(10).fill(0).map((_, i) => ({ role: 'user', content: String(i) }));
      const compressed = compressConversation(messages, { keepRecent: 4 });
      expect(compressed[compressed.length - 1].content).toBe('9');
      expect(compressed[compressed.length - 4].content).toBe('6');
    });

    test('reduces message count for long conversations', () => {
      const messages = Array(20).fill(0).map((_, i) => ({ role: 'user', content: 'msg' }));
      const compressed = compressConversation(messages, { keepRecent: 6 });
      expect(compressed.length).toBeLessThan(messages.length);
      expect(compressed.length).toBe(8); // 1 (first) + 1 (summary) + 6 (recent)
    });

    test('returns original messages if too short to compress', () => {
      const messages = Array(5).fill(0).map((_, i) => ({ role: 'user', content: 'msg' }));
      const compressed = compressConversation(messages, { keepRecent: 6 });
      expect(compressed.length).toBe(5);
    });
  });

  describe('buildSummaryMessage', () => {
    test('includes compressed count', () => {
      const facts = { filesWritten: [], commandsRun: [], toolsUsed: [], errors: [] };
      const msg = buildSummaryMessage(facts, 10);
      expect(msg).toContain('10 earlier steps compressed');
    });

    test('includes file names when present', () => {
      const facts = { filesWritten: ['app.js'], commandsRun: [], toolsUsed: [], errors: [] };
      const msg = buildSummaryMessage(facts, 5);
      expect(msg).toContain('app.js');
    });

    test('includes command names when present', () => {
      const facts = { filesWritten: [], commandsRun: ['npm test'], toolsUsed: [], errors: [] };
      const msg = buildSummaryMessage(facts, 5);
      expect(msg).toContain('npm test');
    });
  });

  describe('ConversationManager Integration', () => {
    let cm;
    beforeEach(() => {
      cm = new ConversationManager();
    });

    test('estimatedTokens() returns a number', () => {
      cm.addAssistantMessage('hello');
      expect(typeof cm.estimatedTokens()).toBe('number');
    });

    test('shouldCompress() returns boolean', () => {
      cm.addAssistantMessage('hello');
      expect(typeof cm.shouldCompress(100)).toBe('boolean');
    });

    test('compress() reduces message count on long conversation', () => {
      for (let i = 0; i < 15; i++) cm.addAssistantMessage('msg');
      const before = cm.messages.length;
      cm.compress({ keepRecent: 6 });
      expect(cm.messages.length).toBeLessThan(before);
    });
  });

  describe('Config Defaults', () => {
    test('CONTEXT_COMPRESSION_THRESHOLD exists in config defaults', () => {
      expect(config).toHaveProperty('CONTEXT_COMPRESSION_THRESHOLD');
      expect(config.CONTEXT_COMPRESSION_THRESHOLD).toBe(80000);
    });

    test('CONTEXT_KEEP_RECENT exists in config defaults', () => {
      expect(config).toHaveProperty('CONTEXT_KEEP_RECENT');
      expect(config.CONTEXT_KEEP_RECENT).toBe(6);
    });
  });
});
