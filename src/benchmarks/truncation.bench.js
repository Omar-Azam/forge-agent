// src/benchmarks/truncation.bench.js — Truncation performance benchmarks
'use strict';

const { smartTruncate, detectContentType } = require('../truncator');

module.exports = function registerBenchmarks(suite) {

  suite.add('detectContentType 100 calls', async () => {
    for (let i = 0; i < 100; i++) {
      detectContentType('console.log("hello");', 'app.js');
      detectContentType('PASS tests/index.test.js', 'test.output');
      detectContentType('{"a": 1}', 'data.json');
      detectContentType('User info: name=John', 'user.txt');
    }
  }, {
    category: 'truncation',
    description: 'Detect content type 100 times',
    baseline: 20
  });

  suite.add('truncateCode 5KB', async () => {
    const code = 'function method() { console.log("line"); }\n'.repeat(150); // ~5KB
    smartTruncate(code, 1000, { type: 'code' });
  }, {
    category: 'truncation',
    description: 'Truncate 5KB of JS code',
    baseline: 20
  });

  suite.add('truncateCode 50KB', async () => {
    const code = 'function method() { console.log("line"); }\n'.repeat(1500); // ~50KB
    smartTruncate(code, 5000, { type: 'code' });
  }, {
    category: 'truncation',
    description: 'Truncate 50KB of JS code',
    baseline: 100
  });

  suite.add('truncateTestOutput 3KB', async () => {
    const output = [
      'PASS tests/auth.test.js',
      'FAIL tests/user.test.js',
      '  ● User creation › should validate email',
      '    expect(received).toBe(expected)',
      '      Expected: true',
      '      Received: false',
      '    at Object.<anonymous> (tests/user.test.js:15:20)',
    ].join('\n').repeat(30); // ~3KB
    smartTruncate(output, 500, { type: 'test_output' });
  }, {
    category: 'truncation',
    description: 'Truncate 3KB of Jest output',
    baseline: 20
  });

  suite.add('truncateJson nested 2KB', async () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            data: 'x'.repeat(100),
            items: Array(10).fill({ key: 'val' })
          }
        }
      }
    };
    const json = JSON.stringify(obj).repeat(5); // ~2KB
    smartTruncate(json, 300, { type: 'json' });
  }, {
    category: 'truncation',
    description: 'Truncate 2KB of nested JSON',
    baseline: 30
  });

};
