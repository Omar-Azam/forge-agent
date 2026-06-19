// tests/truncator.test.js — Test suite for smart truncation
'use strict';

const { detectContentType, smartTruncate } = require('../src/truncator');
const config = require('../src/config');

describe('Truncator', () => {
  
  describe('detectContentType', () => {
    test('returns code for JS function definitions', () => {
      const text = 'function myFunc() {\n  return 1;\n}';
      expect(detectContentType(text)).toBe('code');
    });

    test('returns code for Python class definitions', () => {
      const text = 'class MyClass:\n    def __init__(self):\n        pass';
      expect(detectContentType(text)).toBe('code');
    });

    test('returns test_output for Jest output', () => {
      const text = 'Tests:       1 failed, 31 passed, 32 total';
      expect(detectContentType(text)).toBe('test_output');
    });

    test('returns test_output for text containing FAIL and passed', () => {
      const text = 'FAIL tests/git-tools.test.js\n[cache] HIT: git_status\n31 passed';
      expect(detectContentType(text)).toBe('test_output');
    });

    test('returns file_list for newline-separated paths', () => {
      const text = 'src/index.js\nsrc/tools.js\nsrc/config.js\ntests/tools.test.js\npackage.json\nREADME.md';
      expect(detectContentType(text)).toBe('file_list');
    });

    test('returns git_output for commit hash', () => {
      const text = 'commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\nAuthor: Test <test@example.com>';
      expect(detectContentType(text)).toBe('git_output');
    });

    test('returns git_output for diff headers', () => {
      const text = 'diff --git a a/src/index.js b/src/index.js\nindex 12345..67890 100644';
      expect(detectContentType(text)).toBe('git_output');
    });

    test('returns json for valid JSON', () => {
      const text = '{"name": "test", "value": 123}';
      expect(detectContentType(text)).toBe('json');
    });

    test('returns json for JSON-like structure', () => {
      const text = '{\n  "key": "val",\n  "nested": { "a": 1 }\n}';
      expect(detectContentType(text)).toBe('json');
    });

    test('returns text for plain prose', () => {
      const text = 'This is a normal sentence about something interesting.';
      expect(detectContentType(text)).toBe('text');
    });
  });

  describe('smartTruncate', () => {
    test('returns text unchanged when under maxLength', () => {
      const text = 'short text';
      expect(smartTruncate(text, 100)).toBe(text);
    });

    test('returns string no longer than maxLength', () => {
      const text = 'a'.repeat(200);
      const truncated = smartTruncate(text, 50);
      expect(truncated.length).toBeLessThanOrEqual(50);
    });

    test('includes truncation notice when cutting (large enough max)', () => {
      const text = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10';
      const truncated = smartTruncate(text, 50);
      expect(truncated).toMatch(/truncated|\[\.\.\.\]/i);
    });

    test('truncateCode preserves first and last lines', () => {
      const lines = [];
      for (let i = 1; i <= 200; i++) lines.push(`const line${i} = ${i};`);
      const text = lines.join('\n');
      const truncated = smartTruncate(text, 1000, { type: 'code' });
      
      expect(truncated).toContain('const line1 = 1;');
      expect(truncated).toContain('const line200 = 200;');
      expect(truncated).toMatch(/\/\/ \.\.\. \[.* lines total/);
    });

    test('truncateCode never cuts mid-line', () => {
      const lines = [];
      for (let i = 0; i < 100; i++) lines.push(`const x${i} = ${i};`);
      const longText = lines.join('\n');
      const truncatedLong = smartTruncate(longText, 500, { type: 'code' });
      
      const resultLines = truncatedLong.split('\n');
      resultLines.forEach(l => {
        if (!l.includes('...')) {
            expect(l).toMatch(/^const x\d+ = \d+;$/);
        }
      });
    });

    test('truncateTestOutput includes summary line', () => {
      const text = 'FAIL some.test.js\n' + 'junk line here to force truncation\n'.repeat(100) + 'Tests: 1 failed, 1 total';
      const truncated = smartTruncate(text, 500, { type: 'test_output' });
      expect(truncated).toContain('Tests: 1 failed, 1 total');
      expect(truncated).toContain('FAIL some.test.js');
    });

    test('truncateFileList keeps first entries', () => {
      const lines = [];
      for (let i = 1; i <= 200; i++) lines.push(`file_${i}_long_filename_to_force_size.js`);
      const text = lines.join('\n');
      const truncated = smartTruncate(text, 4000, { type: 'file_list' });
      
      expect(truncated).toContain('file_1_long_filename');
      expect(truncated).toContain('file_50_long_filename');
      expect(truncated).toContain('more files omitted');
    });

    test('truncateGitOutput keeps commit headers', () => {
      const text = 'commit abc123def456\nAuthor: Me\nDate: Today\n\n    Message\n\ndiff --git a/a b/b\n' + 'line with some content to take space\n'.repeat(100);
      const truncated = smartTruncate(text, 1000, { type: 'git_output' });
      expect(truncated).toContain('commit abc123def456');
      expect(truncated).toContain('Author: Me');
    });

    test('truncateJson handles arrays longer than 20 items', () => {
      const arr = [];
      for (let i = 0; i < 50; i++) arr.push({ id: i, name: `item ${i}` });
      // Use formatted JSON to ensure size is predictable and triggers smart truncation
      const text = JSON.stringify(arr, null, 2);
      // Original is ~4000 chars. Truncated is ~1000.
      const truncated = smartTruncate(text, 2000, { type: 'json' });
      
      const parsed = JSON.parse(truncated);
      expect(parsed).toHaveLength(11); // 10 items + "... 40 more items" string
      expect(parsed[10]).toContain('40 more items');
    });

    test('truncateJson handles deeply nested objects', () => {
      const obj = { 
        a: { 
          b: { 
            c: { 
              d: { 
                e: {
                  f: {
                    g: 1
                  }
                }
              } 
            } 
          } 
        },
        other: "some long data here to ensure we cross the maxLength threshold"
      };
      const text = JSON.stringify(obj, null, 2);
      // Set limit slightly below original length to trigger processing
      const truncated = smartTruncate(text, text.length - 10, { type: 'json' });
      
      expect(truncated).toContain('[Object]');
      expect(truncated).not.toContain('"g": 1');
    });

    test('truncateGeneric keeps head and tail', () => {
      const text = 'START' + 'middle'.repeat(500) + 'END';
      const truncated = smartTruncate(text, 200, { type: 'text' });
      expect(truncated.startsWith('START')).toBe(true);
      expect(truncated.endsWith('END')).toBe(true);
      expect(truncated).toContain('truncated');
    });

    test('respects config.SMART_TRUNCATION=false', () => {
      const original = config.SMART_TRUNCATION;
      config.SMART_TRUNCATION = false;
      try {
        const text = 'A'.repeat(1000);
        const truncated = smartTruncate(text, 100);
        expect(truncated).toContain('chars total');
      } finally {
        config.SMART_TRUNCATION = original;
      }
    });

    test('SMART_TRUNCATION defaults to true in config', () => {
      expect(config.SMART_TRUNCATION).toBe(true);
    });

    test('smartTruncate never throws on bad input', () => {
      expect(() => smartTruncate(null, 10)).not.toThrow();
      expect(() => smartTruncate(undefined, 10)).not.toThrow();
      expect(() => smartTruncate({}, 10)).not.toThrow();
    });
  });
});
