// tests/formatter.test.js — Test suite for Forge Agent Output Formatter
'use strict';

const { format, detectBestFormat, SUPPORTED_FORMATS } = require('../src/formatter');
const config = require('../src/config');

describe('Output Formatter', () => {

  describe('format entry point', () => {
    test('format returns string for all supported formats', () => {
      SUPPORTED_FORMATS.forEach(f => {
        const result = format('some content', f, { task: 'test' });
        expect(typeof result).toBe('string');
      });
    });

    test('format falls back to text for unknown format name', () => {
      const result = format('hello', 'nonexistent');
      expect(result).toBe('hello');
    });

    test('format never throws for any input', () => {
      expect(() => format(null, 'json')).not.toThrow();
      expect(() => format({}, 'markdown')).not.toThrow();
    });
  });

  describe('formatText', () => {
    test('formatText returns content unchanged (trimmed)', () => {
      expect(format('  hello world  ', 'text')).toBe('hello world');
    });

    test('formatText handles empty string', () => {
      expect(format('', 'text')).toBe('');
      expect(format(null, 'text')).toBe('');
    });
  });

  describe('formatMarkdown', () => {
    test('formatMarkdown returns content as-is when it already has # headers', () => {
      const content = '# Result\n\nDone.';
      expect(format(content, 'markdown')).toContain('# Result');
    });

    test('formatMarkdown wraps plain prose in markdown structure', () => {
      const content = 'The task is finished.';
      const result = format(content, 'markdown');
      expect(result).toContain('# Task Result');
      expect(result).toContain(content);
    });

    test('formatMarkdown includes task in output when opts.task provided', () => {
      const result = format('content', 'markdown', { task: 'build api' });
      expect(result).toContain('> **Task:** build api');
    });

    test('formatMarkdown result is a string', () => {
      expect(typeof format('prose', 'markdown')).toBe('string');
    });
  });

  describe('formatJson', () => {
    test('formatJson returns valid JSON string', () => {
      const result = format('hello', 'json');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('formatJson output parses successfully with JSON.parse', () => {
      const content = 'result text';
      const parsed = JSON.parse(format(content, 'json'));
      expect(parsed.forge_agent.output).toBe(content);
    });

    test('formatJson includes forge_agent wrapper key', () => {
      const parsed = JSON.parse(format('x', 'json'));
      expect(parsed).toHaveProperty('forge_agent');
    });

    test('formatJson includes output field containing the content', () => {
      const parsed = JSON.parse(format('test content', 'json'));
      expect(parsed.forge_agent.output).toBe('test content');
    });

    test('formatJson includes timestamp when opts.timestamp is true', () => {
      const result = format('x', 'json', { timestamp: true });
      const parsed = JSON.parse(result);
      expect(parsed.forge_agent).toHaveProperty('timestamp');
    });

    test('formatJson omits timestamp when opts.timestamp is false', () => {
      const result = format('x', 'json', { timestamp: false });
      const parsed = JSON.parse(result);
      expect(parsed.forge_agent).not.toHaveProperty('timestamp');
    });
  });

  describe('formatJsonRaw', () => {
    test('formatJsonRaw pretty-prints valid JSON content', () => {
      const content = '{"a":1}';
      const result = format(content, 'json-raw');
      expect(result).toContain('"a": 1');
    });

    test('formatJsonRaw extracts JSON from markdown code block', () => {
      const content = 'Here is JSON:\n```json\n{"success": true}\n```';
      const result = format(content, 'json-raw');
      expect(result).toContain('"success": true');
    });

    test('formatJsonRaw falls back to json envelope when no JSON found', () => {
      const content = 'just text';
      const result = format(content, 'json-raw');
      expect(result).toContain('forge_agent');
      expect(result).toContain('just text');
    });

    test('formatJsonRaw never throws', () => {
      expect(() => format('{{{', 'json-raw')).not.toThrow();
    });
  });

  describe('formatMinimal', () => {
    test('formatMinimal removes # markdown headers', () => {
      const content = '# Header\nText';
      expect(format(content, 'minimal')).toBe('Header\nText');
    });

    test('formatMinimal removes ** bold markers but keeps text', () => {
      const content = 'This is **bold** text.';
      expect(format(content, 'minimal')).toBe('This is bold text.');
    });

    test('formatMinimal removes consecutive blank lines', () => {
      const content = 'Line 1\n\n\n\nLine 2';
      expect(format(content, 'minimal')).toBe('Line 1\n\nLine 2');
    });

    test('formatMinimal handles empty string', () => {
      expect(format('', 'minimal')).toBe('');
    });
  });

  describe('formatSilent', () => {
    test('formatSilent returns empty string', () => {
      expect(format('anything', 'silent')).toBe('');
    });
  });

  describe('detectBestFormat', () => {
    test('detectBestFormat returns json-raw for content starting with {', () => {
      expect(detectBestFormat('{"x":1}')).toBe('json-raw');
    });

    test('detectBestFormat returns markdown for content with # headers', () => {
      expect(detectBestFormat('# Title\nContent')).toBe('markdown');
    });

    test('detectBestFormat returns text for plain prose', () => {
      expect(detectBestFormat('Just a normal sentence.')).toBe('text');
    });
  });

  describe('Constants and Config', () => {
    test('SUPPORTED_FORMATS contains all 6 format names', () => {
      expect(SUPPORTED_FORMATS).toHaveLength(6);
      expect(SUPPORTED_FORMATS).toContain('text');
      expect(SUPPORTED_FORMATS).toContain('markdown');
      expect(SUPPORTED_FORMATS).toContain('json');
      expect(SUPPORTED_FORMATS).toContain('json-raw');
      expect(SUPPORTED_FORMATS).toContain('minimal');
      expect(SUPPORTED_FORMATS).toContain('silent');
    });

    test('OUTPUT_FORMAT defaults to text in config', () => {
      expect(config.OUTPUT_FORMAT).toBe('text');
    });
  });
});
