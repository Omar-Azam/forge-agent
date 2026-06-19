// tests/parser.test.js — Robust Parser Test Suite
'use strict';

const { parseResponse, hasToolCall, containsTaskComplete, extractLeadingText } = require('../src/parser');

describe('Parser Module', () => {

  describe('parseResponse', () => {
    
    test('Case 1: Pure tool call (no surrounding text)', () => {
      const input = `<tool_call>
{"tool": "read_file", "args": {"path": "test.js"}}
</tool_call>`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
      expect(result.args.path).toBe('test.js');
    });

    test('Case 2: Text before tool call', () => {
      const input = `I'll read the file first.
<tool_call>
{"tool": "read_file", "args": {"path": "test.js"}}
</tool_call>`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
    });

    test('Case 3: Tool call inline', () => {
      const input = `<tool_call>{"tool": "read_file", "args": {"path": "test.js"}}</tool_call>`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
    });

    test('Case 4: JSON code block', () => {
      const input = "Check this out:\n```json\n{\"tool\": \"read_file\", \"args\": {\"path\": \"test.js\"}}\n```";
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
    });

    test('Case 5: Bare JSON object', () => {
      const input = `{"tool": "read_file", "args": {"path": "test.js"}}`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
    });

    test('Case 6: Function call style', () => {
      const input = `read_file("test.js")`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
      expect(result.args.path).toBe('test.js');
    });

    test('Case 7: TASK_COMPLETE', () => {
      const input = `Great, all done!
TASK_COMPLETE`;
      const result = parseResponse(input);
      expect(result.type).toBe('task_complete');
    });

    test('Case 8: Pure text response', () => {
      const input = `The project uses Express and TypeScript.`;
      const result = parseResponse(input);
      expect(result.type).toBe('text');
      expect(result.content).toBe(input);
    });

    test('handles mixed content with reasoning and tool call', () => {
      const input = `Thinking: I should check the directory.
<tool_call>
{"tool": "list_directory", "args": {"path": "."}}
</tool_call>`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('list_directory');
    });

    test('returns empty for empty string', () => {
      expect(parseResponse('').type).toBe('empty');
    });

    test('returns empty for null', () => {
      expect(parseResponse(null).type).toBe('empty');
    });

    test('handles malformed JSON inside tags by returning text or trying fix', () => {
      const input = `<tool_call>{"tool": "read_file", "args": {"path": "test.js",}}</tool_call>`; // trailing comma
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
    });

    test('handles single quotes in JSON', () => {
      const input = `<tool_call>{'tool': 'read_file', 'args': {'path': 'test.js'}}</tool_call>`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
    });

    test('detects TASK_COMPLETE even if not at the very end', () => {
      const input = `TASK_COMPLETE\nI hope that helps!`;
      expect(parseResponse(input).type).toBe('task_complete');
    });

    test('extracts tool from ``` block without json language tag', () => {
      const input = "```\n{\"tool\": \"run_command\", \"args\": {\"command\": \"ls\"}}\n```";
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('run_command');
    });

    test('handles function call with multiple arguments', () => {
      // This depends on how tryParseFunctionCall is implemented to handle more than one arg
      // Our implementation is "best effort". Let's test what it can do.
      const input = `read_file(path="test.js")`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('read_file');
      expect(result.args.path).toBe('test.js');
    });

    test('handles bare JSON with multi-line prose', () => {
      const input = `I will now execute the following:
{"tool": "delete_file", "args": {"path": "old.log"}}
Please let me know if you need anything else.`;
      const result = parseResponse(input);
      expect(result.type).toBe('tool_call');
      expect(result.name).toBe('delete_file');
    });

    test('extracts leading text correctly', () => {
      const input = `Reasoning here.\n<tool_call>{"tool":"test"}</tool_call>`;
      expect(extractLeadingText(input)).toBe('Reasoning here.');
    });

    test('hasToolCall works for all formats', () => {
      expect(hasToolCall('<tool_call>')).toBe(true);
      expect(hasToolCall('```json\n{"tool":')).toBe(true);
      expect(hasToolCall('{"tool": "test"}')).toBe(true);
    });

    test('containsTaskComplete works for multiple variations', () => {
      expect(containsTaskComplete('TASK_COMPLETE')).toBe(true);
      expect(containsTaskComplete('\nTASK_COMPLETE\n')).toBe(true);
      expect(containsTaskComplete('Done. TASK_COMPLETE')).toBe(true);
    });

    test('Case 5 again: bare JSON multiline', () => {
        const input = `
{
  "tool": "write_file",
  "args": {
    "path": "test.txt",
    "content": "hello"
  }
}`;
        const result = parseResponse(input);
        expect(result.type).toBe('tool_call');
        expect(result.name).toBe('write_file');
        expect(result.args.content).toBe('hello');
    });

    test('ignores non-tool JSON objects', () => {
        const input = `Here is some data: {"foo": "bar"}`;
        const result = parseResponse(input);
        expect(result.type).toBe('text');
    });

    test('handles Claude Code style tool names', () => {
        const input = `Read("package.json")`;
        const result = parseResponse(input);
        expect(result.type).toBe('tool_call');
        expect(result.name).toBe('Read');
        expect(result.args.path).toBe('package.json');
    });

    test('handles function call style with key=value', () => {
        const input = `run_command(command="ls -la")`;
        const result = parseResponse(input);
        expect(result.type).toBe('tool_call');
        expect(result.name).toBe('run_command');
        expect(result.args.command).toBe('ls -la');
    });

  });

});