// src/benchmarks/parser.bench.js — Parser performance benchmarks
'use strict';

const { parseResponse } = require('../parser');

module.exports = function registerBenchmarks(suite) {
  
  suite.add('parse simple tool call', async () => {
    const input = '{"name": "read_file", "args": {"path": "test.js"}}';
    parseResponse(input);
  }, {
    category: 'parser',
    description: 'Parse a valid JSON tool call',
    baseline: 5
  });

  suite.add('parse fenced code block', async () => {
    const input = 'Here is the tool call:\n\n```tool_call\n{"name": "write_file", "args": {"path": "app.js", "content": "console.log(1)"}}\n```';
    parseResponse(input);
  }, {
    category: 'parser',
    description: 'Parse a tool call inside a fenced code block',
    baseline: 5
  });

  suite.add('parse with think blocks', async () => {
    const think = '<think>\n' + 'I need to read the file first to understand the context. '.repeat(50) + '\n</think>\n';
    const tool = '```tool_call\n{"name": "read_file", "args": {"path": "src/index.js"}}\n```';
    parseResponse(think + tool);
  }, {
    category: 'parser',
    description: 'Parse response with DeepSeek R1 thinking block',
    baseline: 10
  });

  suite.add('parse malformed JSON recovery', async () => {
    const input = '```tool_call\n{\n  "name": "run_command",\n  "args": {\n    "command": "ls -la",\n  }\n}\n```'; // trailing comma
    parseResponse(input);
  }, {
    category: 'parser',
    description: 'Graceful recovery from slightly malformed JSON',
    baseline: 20
  });

  suite.add('parse large response 10KB', async () => {
    const prose = 'Word '.repeat(1500); // ~7KB
    const tool = '\n\n```tool_call\n{"name": "git_status", "args": {}}\n```\n\n';
    const footer = 'Footer '.repeat(500); // ~3KB
    parseResponse(prose + tool + footer);
  }, {
    category: 'parser',
    description: 'Parse tool call embedded in a 10KB string',
    baseline: 50
  });

};
