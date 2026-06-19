// src/benchmarks/memory.bench.js — Memory and history performance benchmarks
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MemoryStore } = require('../memory');
const { HistoryStore } = require('../history');
const config = require('../config');

module.exports = function registerBenchmarks(suite) {
  const tempMemoryFile = path.join(os.tmpdir(), `fa-bench-memory-${Date.now()}.json`);
  const tempHistoryFile = path.join(os.tmpdir(), `fa-bench-history-${Date.now()}.json`);
  
  const memoryStore = new MemoryStore(tempMemoryFile);
  const historyStore = new HistoryStore(tempHistoryFile);

  suite.add('buildMemoryContext empty', async () => {
    memoryStore.buildMemoryContext('/fake/path');
  }, {
    category: 'memory',
    description: 'Build context with empty memory',
    baseline: 5
  });

  suite.add('buildMemoryContext full', async () => {
    const projectDir = '/fake/full-project';
    memoryStore.updateProjectMemory(projectDir, {
      techStack: Array(10).fill('package-name'),
      filesCreated: Array(50).fill('src/module/file.js'),
      completedTasks: Array(20).fill('I built a robust authentication system with JWT and bcrypt.'),
      patterns: Array(15).fill('use async/await for all db queries'),
      errors: Array(10).fill('Database connection timeout')
    });
    memoryStore.buildMemoryContext(projectDir);
  }, {
    category: 'memory',
    description: 'Build context with populated memory',
    baseline: 10
  });

  suite.add('history addEntry', async () => {
    historyStore.addEntry({
      task: 'build a feature',
      status: 'completed',
      durationMs: 5000,
      stepsCount: 10,
      filesWritten: ['app.js', 'style.css']
    });
  }, {
    category: 'memory',
    description: 'Add an entry to task history',
    baseline: 20
  });

  suite.add('history getEntries 100 records', async () => {
    // Pre-populate
    const history = { version: 1, entries: [] };
    for (let i = 0; i < 100; i++) {
      history.entries.push({
        id: `id-${i}`,
        timestamp: new Date().toISOString(),
        task: `task number ${i}`,
        status: 'completed',
        workingDir: '/some/dir'
      });
    }
    fs.writeFileSync(tempHistoryFile, JSON.stringify(history), 'utf8');
    
    historyStore.getEntries({ limit: 100 });
  }, {
    category: 'memory',
    description: 'Retrieve 100 history entries',
    baseline: 20
  });

  suite.add('history formatCompact 50 entries', async () => {
    const entries = [];
    for (let i = 0; i < 50; i++) {
      entries.push({
        timestamp: new Date().toISOString(),
        task: `Extremely long task description that should be truncated by the compact formatter to fit on a single line in the terminal view.`,
        status: i % 2 === 0 ? 'completed' : 'failed'
      });
    }
    entries.forEach((e, i) => historyStore.formatCompact(e, i));
  }, {
    category: 'memory',
    description: 'Format 50 history entries for display',
    baseline: 30
  });

  suite.add('cleanup memory files', async () => {
    try {
      if (fs.existsSync(tempMemoryFile)) fs.unlinkSync(tempMemoryFile);
      if (fs.existsSync(tempHistoryFile)) fs.unlinkSync(tempHistoryFile);
    } catch {}
  }, {
    category: 'memory',
    description: 'Internal memory benchmark cleanup'
  });
};
