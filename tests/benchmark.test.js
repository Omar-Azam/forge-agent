// tests/benchmark.test.js — Test suite for Forge Agent benchmark system
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { 
  BenchmarkSuite, 
  calculateStats, 
  formatMs, 
  compareReports, 
  saveReport 
} = require('../src/benchmark');

describe('Benchmark System', () => {

  test('BenchmarkSuite constructor creates instance', () => {
    const suite = new BenchmarkSuite({ name: 'Test Suite' });
    expect(suite.name).toBe('Test Suite');
    expect(suite.benchmarks).toEqual([]);
  });

  test('BenchmarkSuite.add registers a benchmark', () => {
    const suite = new BenchmarkSuite();
    suite.add('test bench', async () => {}, { category: 'test' });
    expect(suite.benchmarks.length).toBe(1);
    expect(suite.benchmarks[0].name).toBe('test bench');
  });

  test('BenchmarkSuite.run returns a BenchmarkReport', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    suite.add('fast bench', async () => {});
    const report = await suite.run();
    expect(report.suiteName).toBe('Core Performance');
    expect(Array.isArray(report.results)).toBe(true);
    expect(report.results.length).toBe(1);
    expect(report.passed).toBe(1);
  });

  test('BenchmarkResult status logic', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    
    // Pass
    suite.add('pass bench', async () => {}, { baseline: 100 });
    // Warn (will be hard to mock timing exactly, but we can check the _getStatus method)
    expect(suite._getStatus(120, 100)).toBe('warn');
    expect(suite._getStatus(160, 100)).toBe('fail');
    expect(suite._getStatus(50, 100)).toBe('pass');
    expect(suite._getStatus(50, null)).toBe('pass');
  });

  test('calculateStats returns correct stats for simple array', () => {
    const stats = calculateStats([10, 20, 30]);
    expect(stats.minMs).toBe(10);
    expect(stats.maxMs).toBe(30);
    expect(stats.meanMs).toBe(20);
    expect(stats.medianMs).toBe(20);
    expect(stats.stddevMs).toBeGreaterThan(0);
  });

  test('calculateStats handles single element', () => {
    const stats = calculateStats([50]);
    expect(stats.meanMs).toBe(50);
    expect(stats.stddevMs).toBe(0);
  });

  test('formatMs utility', () => {
    expect(formatMs(0.5)).toBe('0.50ms');
    expect(formatMs(123.456)).toBe('123.5ms');
    expect(formatMs(1500)).toBe('1.5s');
    expect(formatMs(0)).toBe('0ms');
  });

  test('compareReports identifies improvements', () => {
    const current = {
      results: [{ name: 'bench1', meanMs: 10 }]
    };
    const previous = {
      results: [{ name: 'bench1', meanMs: 20 }]
    };
    const diffs = compareReports(current, previous);
    expect(diffs[0].improved).toBe(true);
    expect(diffs[0].changePct).toBe(50);
  });

  test('saveReport creates a file', () => {
    const report = { suiteName: 'test', results: [] };
    const savedPath = saveReport(report, 'test-tag');
    expect(savedPath).not.toBe(false);
    expect(fs.existsSync(savedPath)).toBe(true);
    // cleanup
    fs.unlinkSync(savedPath);
  });

  // Live registration tests (iterations: 1)
  
  test('parser benchmarks register and run', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    require('../src/benchmarks/parser.bench')(suite);
    const report = await suite.run();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.every(r => r.error === null)).toBe(true);
  }, 10000);

  test('truncation benchmarks register and run', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    require('../src/benchmarks/truncation.bench')(suite);
    const report = await suite.run();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.every(r => r.error === null)).toBe(true);
  }, 10000);

  test('search benchmarks register and run', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    require('../src/benchmarks/search.bench')(suite);
    const report = await suite.run();
    if (report.failed > 0) {
      console.log('Search bench errors:', report.results.filter(r => r.error).map(r => `${r.name}: ${r.error}`));
    }
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.every(r => r.error === null)).toBe(true);
  }, 15000);

  test('memory benchmarks register and run', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    require('../src/benchmarks/memory.bench')(suite);
    const report = await suite.run();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.every(r => r.error === null)).toBe(true);
  }, 10000);

  test('tools benchmarks register and run', async () => {
    const suite = new BenchmarkSuite({ iterations: 1, warmup: false });
    require('../src/benchmarks/tools.bench')(suite);
    const report = await suite.run();
    if (report.failed > 0) {
      console.log('Tools bench errors:', report.results.filter(r => r.error).map(r => `${r.name}: ${r.error}`));
    }
    // We expect some results, plus the cleanup bench
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.some(r => r.name === 'cleanup temp files')).toBe(true);
    expect(report.results.every(r => r.error === null)).toBe(true);
  }, 20000);

});
