// tests/parser.test.js — Day 2: Full test suite for src/parser.js
'use strict';

const { parseResponse, formatToolResult, stripThinkingBlocks, isAskingQuestion } = require('../src/parser');

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────

function expectToolCall(result, expectedName, expectedArgs) {
  expect(result.type).toBe('tool_call');
  expect(result.name).toBe(expectedName);
  if (expectedArgs) {
    Object.entries(expectedArgs).forEach(([k, v]) => {
      expect(result.args[k]).toEqual(v);
    });
  }
}

function fence(lang, body) {
  return '```' + lang + '\n' + body + '\n```';
}

// ─────────────────────────────────────────────────────────
//  Strategy 0 — bare "tool_call\n{json}" (real DOM output)
// ─────────────────────────────────────────────────────────

describe('Strategy 0 — bare DOM output: tool_call\\n{json}', () => {
  test('list_directory call', () => {
    const input = 'tool_call\n{\n  "name": "list_directory",\n  "args": { "path": "." }\n}';
    expectToolCall(parseResponse(input), 'list_directory', { path: '.' });
  });

  test('write_file with long content', () => {
    const content = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>';
    const input = `tool_call\n{\n  "name": "write_file",\n  "args": {\n    "path": "index.html",\n    "content": "${content}"\n  }\n}`;
    expectToolCall(parseResponse(input), 'write_file', { path: 'index.html' });
  });

  test('run_command call', () => {
    const input = 'tool_call\n{ "name": "run_command", "args": { "command": "npm install" } }';
    expectToolCall(parseResponse(input), 'run_command', { command: 'npm install' });
  });

  test('create_directory call', () => {
    const input = 'tool_call\n{ "name": "create_directory", "args": { "path": "./stopwatch" } }';
    expectToolCall(parseResponse(input), 'create_directory', { path: './stopwatch' });
  });

  test('handles leading/trailing whitespace', () => {
    const input = '  tool_call  \n  { "name": "read_file", "args": { "path": "README.md" } }  ';
    expectToolCall(parseResponse(input), 'read_file');
  });

  test('handles multiline pretty-printed JSON', () => {
    const input = [
      'tool_call',
      '{',
      '  "name": "search_in_files",',
      '  "args": {',
      '    "pattern": "TODO",',
      '    "directory": "src"',
      '  }',
      '}',
    ].join('\n');
    expectToolCall(parseResponse(input), 'search_in_files', { pattern: 'TODO' });
  });

  test('real sample: stopwatch task list_directory (from actual session)', () => {
    const input = 'tool_call\n{\n  "name": "list_directory",\n  "args": {\n    "path": "/home/omar/Code/DeepSeek_Agent",\n    "recursive": false\n  }\n}';
    const result = parseResponse(input);
    expect(result.type).toBe('tool_call');
    expect(result.name).toBe('list_directory');
    expect(result.args.recursive).toBe(false);
  });

  test('real sample: stopwatch task write_file index.html (from actual session)', () => {
    const input = 'tool_call\n{\n  "name": "write_file",\n  "args": {\n    "path": "/home/omar/Code/DeepSeek_Agent/stopwatch/index.html",\n    "content": "<!DOCTYPE html>\\n<html lang=\\"en\\">"\n  }\n}';
    expectToolCall(parseResponse(input), 'write_file');
  });
});

// ─────────────────────────────────────────────────────────
//  Strategy 1 — ```tool_call fenced block
// ─────────────────────────────────────────────────────────

describe('Strategy 1 — ```tool_call fenced block', () => {
  test('minimal clean fence', () => {
    const input = fence('tool_call', '{ "name": "read_file", "args": { "path": "src/index.js" } }');
    expectToolCall(parseResponse(input), 'read_file', { path: 'src/index.js' });
  });

  test('case-insensitive tag', () => {
    const input = fence('TOOL_CALL', '{ "name": "delete_file", "args": { "path": "old.txt" } }');
    expectToolCall(parseResponse(input), 'delete_file');
  });

  test('prose BEFORE fence is correctly ignored', () => {
    const input = "I'll check the directory structure first.\n\n" +
      fence('tool_call', '{ "name": "list_directory", "args": { "path": "." } }');
    expectToolCall(parseResponse(input), 'list_directory');
  });

  test('pretty-printed JSON inside fence', () => {
    const input = fence('tool_call', '{\n  "name": "write_file",\n  "args": {\n    "path": "out.txt",\n    "content": "hello"\n  }\n}');
    expectToolCall(parseResponse(input), 'write_file', { path: 'out.txt', content: 'hello' });
  });

  test('args aliased as "arguments"', () => {
    const input = fence('tool_call', '{ "name": "read_file", "arguments": { "path": "README.md" } }');
    expectToolCall(parseResponse(input), 'read_file', { path: 'README.md' });
  });

  test('args aliased as "parameters"', () => {
    const input = fence('tool_call', '{ "name": "read_file", "parameters": { "path": "README.md" } }');
    expectToolCall(parseResponse(input), 'read_file');
  });

  test('returns error type on completely invalid JSON', () => {
    const input = fence('tool_call', '{ this is not json at all @@@ }');
    expect(['error', 'tool_call']).toContain(parseResponse(input).type);
  });
});

// ─────────────────────────────────────────────────────────
//  Strategy 2 — ```json block
// ─────────────────────────────────────────────────────────

describe('Strategy 2 — ```json block', () => {
  test('detects tool from json block with "name" key', () => {
    const input = fence('json', '{ "name": "run_command", "args": { "command": "ls -la" } }');
    expectToolCall(parseResponse(input), 'run_command', { command: 'ls -la' });
  });

  test('detects tool from json block with "tool" key', () => {
    const input = fence('json', '{ "tool": "copy_file", "args": { "source": "a.txt", "destination": "b.txt" } }');
    expectToolCall(parseResponse(input), 'copy_file');
  });

  test('ignores json block with no name/tool key', () => {
    const input = fence('json', '{ "foo": "bar", "count": 42 }');
    expect(parseResponse(input).type).toBe('final');
  });

  test('plain ``` block also works', () => {
    const input = fence('', '{ "name": "get_file_info", "args": { "path": "src" } }');
    expectToolCall(parseResponse(input), 'get_file_info');
  });
});

// ─────────────────────────────────────────────────────────
//  Strategy 3 — XML <tool_call>
// ─────────────────────────────────────────────────────────

describe('Strategy 3 — XML <tool_call>', () => {
  test('standard XML format with <input>', () => {
    const input = '<tool_call>\n<name>write_file</name>\n<input>{ "path": "out.txt", "content": "hello" }</input>\n</tool_call>';
    expectToolCall(parseResponse(input), 'write_file');
  });

  test('XML format with <args>', () => {
    const input = '<tool_call>\n<name>read_file</name>\n<args>{ "path": "index.js" }</args>\n</tool_call>';
    expectToolCall(parseResponse(input), 'read_file');
  });
});

// ─────────────────────────────────────────────────────────
//  Strategy 4 — DOM-stripped XML (angle brackets removed)
// ─────────────────────────────────────────────────────────

describe('Strategy 4 — DOM-stripped XML', () => {
  test('parses stripped format', () => {
    const input = 'tool_call name write_file /name input { "path": "test.js" } /input /tool_call';
    expectToolCall(parseResponse(input), 'write_file');
  });
});

// ─────────────────────────────────────────────────────────
//  Strategy 5 — plain JSON object anywhere in text
// ─────────────────────────────────────────────────────────

describe('Strategy 5 — plain JSON with name key', () => {
  test('finds JSON in middle of prose', () => {
    const input = 'Here is my plan: { "name": "delete_file", "args": { "path": "old.txt" } } Let me proceed.';
    expectToolCall(parseResponse(input), 'delete_file');
  });

  test('handles nested args inside JSON', () => {
    const input = '{ "name": "run_command", "args": { "command": "npm test", "timeout": 30000 } }';
    const result = parseResponse(input);
    expect(result.type).toBe('tool_call');
    expect(result.args.timeout).toBe(30000);
  });
});

// ─────────────────────────────────────────────────────────
//  Final response detection
// ─────────────────────────────────────────────────────────

describe('Final response detection', () => {
  test('plain prose is final', () => {
    const input = 'The calculator has been created with index.html, style.css, and script.js. Open index.html in your browser to use it.';
    expect(parseResponse(input).type).toBe('final');
    expect(parseResponse(input).content).toContain('calculator');
  });

  test('prose that only mentions tool names is still final', () => {
    const inputs = [
      'I used write_file and run_command to complete the task successfully.',
      'The files were created using write_files batch mode.',
      'I ran run_command to verify everything works.',
    ];
    inputs.forEach(input => {
      expect(parseResponse(input).type).toBe('final');
    });
  });

  test('multi-line final response is preserved', () => {
    const input = 'Done! Here is what was created:\n\n- index.html\n- style.css\n- script.js\n\nOpen index.html to use the app.';
    const result = parseResponse(input);
    expect(result.type).toBe('final');
    expect(result.content).toContain('index.html');
    expect(result.content).toContain('style.css');
  });

  test('final response has correct content field', () => {
    const input = 'Task complete.';
    const result = parseResponse(input);
    expect(result.content).toBe('Task complete.');
    expect(result.raw).toBe(input);
  });
});

// ─────────────────────────────────────────────────────────
//  DeepSeek thinking block stripping
// ─────────────────────────────────────────────────────────

describe('Thinking block stripping', () => {
  test('strips <think> blocks from R1 model', () => {
    const input = '<think>\nLet me think about this carefully...\nI should write the files first.\n</think>\ntool_call\n{ "name": "list_directory", "args": { "path": "." } }';
    const result = parseResponse(input);
    expect(result.type).toBe('tool_call');
    expect(result.name).toBe('list_directory');
  });

  test('strips <think> block before final response', () => {
    const input = '<think>Reasoning here...</think>\nThe task is complete.';
    const result = parseResponse(input);
    expect(result.type).toBe('final');
    expect(result.content).not.toContain('<think>');
    expect(result.content).not.toContain('Reasoning here');
  });

  test('stripThinkingBlocks exported function works standalone', () => {
    const input = '<think>internal</think>\nvisible content';
    const result = stripThinkingBlocks(input);
    expect(result).not.toContain('<think>');
    expect(result).toContain('visible content');
  });
});

// ─────────────────────────────────────────────────────────
//  Args extraction edge cases
// ─────────────────────────────────────────────────────────

describe('Args extraction', () => {
  test('boolean args are preserved', () => {
    const input = 'tool_call\n{ "name": "list_directory", "args": { "path": ".", "recursive": true, "show_hidden": false } }';
    const result = parseResponse(input);
    expect(result.args.recursive).toBe(true);
    expect(result.args.show_hidden).toBe(false);
  });

  test('numeric args are preserved', () => {
    const input = 'tool_call\n{ "name": "read_file", "args": { "path": "src.js", "start_line": 10, "end_line": 50 } }';
    const result = parseResponse(input);
    expect(result.args.start_line).toBe(10);
    expect(result.args.end_line).toBe(50);
  });

  test('empty args object is fine', () => {
    const input = 'tool_call\n{ "name": "list_directory", "args": {} }';
    const result = parseResponse(input);
    expect(result.type).toBe('tool_call');
    expect(result.args).toEqual({});
  });

  test('raw field always contains original text', () => {
    const input = 'tool_call\n{ "name": "read_file", "args": { "path": "x.js" } }';
    const result = parseResponse(input);
    expect(result.raw).toBe(input);
  });
});

// ─────────────────────────────────────────────────────────
//  formatToolResult
// ─────────────────────────────────────────────────────────

describe('formatToolResult', () => {
  test('formats success result', () => {
    const result = formatToolResult('read_file', 'file contents here', false);
    expect(result).toContain('read_file');
    expect(result).toContain('SUCCESS');
    expect(result).toContain('file contents here');
  });

  test('formats error result', () => {
    const result = formatToolResult('write_file', 'Permission denied', true);
    expect(result).toContain('write_file');
    expect(result).toContain('ERROR');
    expect(result).toContain('Permission denied');
  });
});

// ─────────────────────────────────────────────────────────
//  isAskingQuestion
// ─────────────────────────────────────────────────────────

describe('isAskingQuestion', () => {
  test('detects a question mark at end of line', () => {
    expect(isAskingQuestion('Should I use TypeScript?')).toBe(true);
  });

  test('detects clarifying question phrases', () => {
    expect(isAskingQuestion('Could you please clarify the requirements?')).toBe(true);
    expect(isAskingQuestion('Can you provide more detail about the API?')).toBe(true);
  });

  test('returns false for plain statements', () => {
    expect(isAskingQuestion('The task is complete.')).toBe(false);
    expect(isAskingQuestion('I have written the files.')).toBe(false);
  });
});
