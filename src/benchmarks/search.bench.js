// src/benchmarks/search.bench.js — Searcher performance benchmarks
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { searchCodebase, fuzzyMatch, scoreMatch, extractSymbols } = require('../searcher');
const config = require('../config');

module.exports = function registerBenchmarks(suite) {
  const tempDir = path.join(os.tmpdir(), `fa-bench-search-${Date.now()}`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  suite.add('fuzzyMatch 500 calls', async () => {
    const list = ['index.js', 'agent.js', 'config.js', 'tools.js', 'parser.js', 'prompt.js'];
    for (let i = 0; i < 500; i++) {
      fuzzyMatch('idx.js', list[i % list.length]);
      fuzzyMatch('agnt.js', list[i % list.length]);
      fuzzyMatch('cnfg', list[i % list.length]);
    }
  }, {
    category: 'search',
    description: 'Call fuzzyMatch 500 times',
    baseline: 50
  });

  suite.add('extractSymbols 100 line JS file', async () => {
    const code = [
      'function test() { console.log(1); }',
      'class Agent { constructor() {} run() {} }',
      'const config = { x: 1 };',
      '/** docs */ export function help() {}',
    ].join('\n').repeat(10); // ~100 lines
    extractSymbols(code, 'js');
  }, {
    category: 'search',
    description: 'Extract symbols from 100 lines of JS',
    baseline: 50
  });

  suite.add('extractSymbols 500 line JS file', async () => {
    const code = [
      'function test() { console.log(1); }',
      'class Agent { constructor() {} run() {} }',
      'const config = { x: 1 };',
      '/** docs */ export function help() {}',
    ].join('\n').repeat(50); // ~500 lines
    extractSymbols(code, 'js');
  }, {
    category: 'search',
    description: 'Extract symbols from 500 lines of JS',
    baseline: 200
  });

  suite.add('searchCodebase 20 files', async () => {
    const originalWorkingDir = config.WORKING_DIR;
    config.WORKING_DIR = tempDir;
    
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(tempDir, `file_${i}.js`), `function method_${i}() { return ${i}; }\n`.repeat(10), 'utf8');
    }
    
    searchCodebase('method_15', tempDir);
    config.WORKING_DIR = originalWorkingDir;
  }, {
    category: 'search',
    description: 'Search codebase across 20 small files',
    baseline: 500
  });

  suite.add('scoreMatch 200 calls', async () => {
    const dummySymbols = [{ name: 'test', kind: 'function' }];
    for (let i = 0; i < 200; i++) {
      scoreMatch('myFunction', 'app.js', 'function myFunction() {}', 'function myFunction()', dummySymbols);
      scoreMatch('Agent', 'agent.js', 'class Agent {}', 'class Agent', dummySymbols);
      scoreMatch('ls', 'tools.js', 'run_command("ls")', 'run_command("ls")', dummySymbols);
    }
  }, {
    category: 'search',
    description: 'Score matches 200 times',
    baseline: 50
  });

  suite.add('cleanup search files', async () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }, {
    category: 'search',
    description: 'Internal search benchmark cleanup'
  });
};
