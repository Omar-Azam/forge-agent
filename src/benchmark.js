// src/benchmark.js — Performance benchmarking system for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

class BenchmarkSuite {
  constructor(opts = {}) {
    this.name = opts.name || 'Core Performance';
    this.timeout = opts.timeout || 30000;
    this.warmup = opts.warmup !== false;
    this.iterations = opts.iterations || 3;
    this.benchmarks = [];
  }

  add(name, fn, opts = {}) {
    this.benchmarks.push({
      name,
      fn,
      category: opts.category || 'general',
      description: opts.description || '',
      baseline: opts.baseline || null
    });
  }

  async run() {
    const results = [];
    const startTime = Date.now();

    for (const bench of this.benchmarks) {
      const durations = [];
      let error = null;

      try {
        // Warm up
        if (this.warmup) {
          await bench.fn();
        }

        for (let i = 0; i < this.iterations; i++) {
          const start = process.hrtime.bigint();
          await bench.fn();
          const end = process.hrtime.bigint();
          const durationMs = Number(end - start) / 1_000_000;
          durations.push(durationMs);
        }
      } catch (err) {
        error = err.message || String(err);
      }

      const stats = calculateStats(durations);
      const status = this._getStatus(stats.mean, bench.baseline);

      results.push({
        ...bench,
        ...stats,
        status: error ? 'fail' : status,
        error
      });
    }

    const report = {
      suiteName: this.name,
      timestamp: new Date().toISOString(),
      totalMs: Date.now() - startTime,
      iterations: this.iterations,
      results,
      passed: results.filter(r => r.status === 'pass').length,
      warned: results.filter(r => r.status === 'warn').length,
      failed: results.filter(r => r.status === 'fail').length,
    };

    return report;
  }

  _getStatus(mean, baseline) {
    if (!baseline) return 'pass';
    if (mean <= baseline) return 'pass';
    if (mean <= baseline * 1.5) return 'warn';
    return 'fail';
  }
}

/**
 * Calculate statistics for an array of durations.
 */
function calculateStats(durations) {
  if (durations.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, stddev: 0 };
  }

  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const sum = durations.reduce((a, b) => a + b, 0);
  const mean = sum / durations.length;

  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const squareDiffs = durations.map(d => Math.pow(d - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / durations.length;
  const stddev = Math.sqrt(avgSquareDiff);

  const round = (n) => Math.round(n * 100) / 100;

  return {
    minMs: round(min),
    maxMs: round(max),
    meanMs: round(mean),
    medianMs: round(median),
    stddevMs: round(stddev)
  };
}

/**
 * Formats a benchmark report for terminal display.
 */
function formatReport(report) {
  const isTTY = process.stdout.isTTY;
  const c = (code, text) => isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;

  const line = '═'.repeat(66);
  const header = [
    `╔${line}╗`,
    `║  ${c('1;37', '🔨 Forge Agent — Benchmark Report'.padEnd(62))}║`,
    `║  ${c('0;90', `Suite: ${report.suiteName}  •  ${report.iterations} iterations  •  ${report.results.length} benchmarks`.padEnd(62))}║`,
    `╚${line}╝`
  ].join('\n');

  const categories = [...new Set(report.results.map(r => r.category))].sort();
  const body = categories.map(cat => {
    const catResults = report.results.filter(r => r.category === cat);
    const catHeader = `\n${c('1;36', cat.toUpperCase())}`;
    const lines = catResults.map(r => {
      const icon = r.status === 'pass' ? c('32', '✅') : (r.status === 'warn' ? c('33', '⚠️ ') : c('31', '❌'));
      const name = r.name.padEnd(30);
      const time = formatMs(r.meanMs).padStart(8);
      const baseline = r.baseline ? ` (baseline: ${r.baseline}ms)` : '';
      const budget = r.baseline ? ` — ${Math.round((r.meanMs / r.baseline) * 100)}% of budget` : '';
      const error = r.error ? `\n    ${c('31', 'Error: ' + r.error)}` : '';
      
      return `${icon}  ${name} ${time}${baseline}${r.status === 'warn' ? budget : ''}${error}`;
    });
    return [catHeader, ...lines].join('\n');
  }).join('\n');

  const footer = [
    `\n${'─'.repeat(68)}`,
    `Results: ${c('32', report.passed + ' passed')}  ${c('33', report.warned + ' warned')}  ${c('31', report.failed + ' failed')}`,
    `Total time: ${report.totalMs}ms`,
    `${'─'.repeat(68)}`
  ].join('\n');

  return header + body + footer;
}

/**
 * Format milliseconds for display.
 */
function formatMs(ms) {
  if (ms === 0) return '0ms';
  if (ms < 1) return ms.toFixed(2) + 'ms';
  if (ms < 1000) return ms.toFixed(1) + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

/**
 * Save a report to a JSON file.
 */
function saveReport(report, customTag = null) {
  try {
    const benchDir = path.join(os.homedir(), '.deepseek-agent', 'benchmarks');
    fs.mkdirSync(benchDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const tag = customTag ? `-${customTag}` : '';
    const fileName = `${date}${tag}-${Date.now()}.json`;
    const filePath = path.join(benchDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    return filePath;
  } catch {
    return false;
  }
}

/**
 * Load the most recent report from the benchmark directory.
 */
function loadLastReport() {
  try {
    const benchDir = path.join(os.homedir(), '.deepseek-agent', 'benchmarks');
    if (!fs.existsSync(benchDir)) return null;

    const files = fs.readdirSync(benchDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(benchDir, a));
        const statB = fs.statSync(path.join(benchDir, b));
        return statB.mtimeMs - statA.mtimeMs;
      });

    if (files.length === 0) return null;

    const lastFile = path.join(benchDir, files[0]);
    const prevFile = files.length > 1 ? path.join(benchDir, files[1]) : null;

    return {
      current: JSON.parse(fs.readFileSync(lastFile, 'utf8')),
      previous: prevFile ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : null
    };
  } catch {
    return null;
  }
}

/**
 * Compare two reports and return differences.
 */
function compareReports(current, previous) {
  if (!current || !previous) return [];

  const comparisons = [];
  for (const curr of current.results) {
    const prev = previous.results.find(r => r.name === curr.name);
    if (!prev) continue;

    const changePct = ((prev.meanMs - curr.meanMs) / prev.meanMs) * 100;
    comparisons.push({
      name: curr.name,
      currentMs: curr.meanMs,
      previousMs: prev.meanMs,
      changePct: Math.round(changePct),
      improved: curr.meanMs < prev.meanMs
    });
  }

  return comparisons;
}

module.exports = {
  BenchmarkSuite,
  calculateStats,
  formatReport,
  formatMs,
  saveReport,
  loadLastReport,
  compareReports
};
