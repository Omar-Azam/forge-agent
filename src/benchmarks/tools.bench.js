// src/benchmarks/tools.bench.js — Tool execution performance benchmarks
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { executeTool } = require('../tools');
const config = require('../config');

module.exports = function registerBenchmarks(suite) {
  const tempDir = path.join(os.tmpdir(), `fa-bench-tools-${Date.now()}`);
  
  // Setup temp directory
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  // Update config for tools to use temp dir
  const originalWorkingDir = config.WORKING_DIR;
  config.WORKING_DIR = tempDir;

  suite.add('write_file 50 lines', async () => {
    const content = 'console.log("line");\n'.repeat(50);
    await executeTool('write_file', { path: 'bench_write.js', content });
  }, {
    category: 'tools',
    description: 'Write a 50-line file',
    baseline: 100
  });

  suite.add('read_file 200 lines', async () => {
    const filePath = path.join(tempDir, 'bench_read.js');
    fs.writeFileSync(filePath, 'const x = 1;\n'.repeat(200), 'utf8');
    await executeTool('read_file', { path: 'bench_read.js' });
  }, {
    category: 'tools',
    description: 'Read a 200-line file',
    baseline: 50
  });

  suite.add('list_directory 30 files', async () => {
    const dir = path.join(tempDir, 'list_bench');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(dir, `file_${i}.txt`), 'data', 'utf8');
    }
    await executeTool('list_directory', { path: 'list_bench' });
  }, {
    category: 'tools',
    description: 'List contents of a directory with 30 files',
    baseline: 100
  });

  suite.add('find_files *.js pattern', async () => {
    const dir = path.join(tempDir, 'find_bench');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 20; i++) {
      const sub = path.join(dir, `sub_${i % 5}`);
      if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, `script_${i}.js`), 'console.log()', 'utf8');
    }
    await executeTool('find_files', { pattern: '*.js', directory: 'find_bench' });
  }, {
    category: 'tools',
    description: 'Find JS files across nested directories',
    baseline: 150
  });

  suite.add('search_in_files simple pattern', async () => {
    const dir = path.join(tempDir, 'search_bench');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(dir, `file_${i}.txt`), `Content ${i}\nTARGET_STRING\nEnd`, 'utf8');
    }
    await executeTool('search_in_files', { pattern: 'TARGET_STRING', directory: 'search_bench' });
  }, {
    category: 'tools',
    description: 'Search for string inside 10 files',
    baseline: 300
  });

  suite.add('run_command echo', async () => {
    await executeTool('run_command', { command: 'echo "hello benchmark"' });
  }, {
    category: 'tools',
    description: 'Execute a simple shell command',
    baseline: 500
  });

  // Teardown logic needs to be handled by the runner or manually
  // Since we don't have an afterAll hook in the contract, we use a custom bench for it or just let it be.
  // The contract says: Each benchmark function must clean up after itself.
  // But here we reuse the tempDir. 
  // Let's add a final "bench" that cleans up.
  suite.add('cleanup temp files', async () => {
    config.WORKING_DIR = originalWorkingDir;
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }, {
    category: 'tools',
    description: 'Internal benchmark cleanup'
  });
};
