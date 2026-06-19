// tests/diagnostics.test.js — Test suite for Forge Agent diagnostics tool
'use strict';

const { 
  generateDiagnostics, 
  formatDiagnostics, 
  formatDiagnosticsMarkdown 
} = require('../src/diagnostics');
const pkg = require('../package.json');

describe('Diagnostics Tool', () => {

  test('generateDiagnostics returns an object', () => {
    const report = generateDiagnostics();
    expect(typeof report).toBe('object');
    expect(report).not.toBeNull();
  });

  test('generateDiagnostics includes required fields', () => {
    const report = generateDiagnostics();
    expect(report).toHaveProperty('version');
    expect(report).toHaveProperty('node');
    expect(report).toHaveProperty('platform');
    expect(report).toHaveProperty('cwd');
    expect(report).toHaveProperty('toolCount');
  });

  test('generateDiagnostics version matches package.json', () => {
    const report = generateDiagnostics();
    expect(report.version).toBe(pkg.version);
  });

  test('generateDiagnostics toolCount is a positive number', () => {
    const report = generateDiagnostics();
    expect(typeof report.toolCount).toBe('number');
    expect(report.toolCount).toBeGreaterThan(0);
  });

  test('generateDiagnostics handles missing environment variables', () => {
    const report = generateDiagnostics();
    expect(report.environment).toHaveProperty('DISPLAY');
    expect(report.environment).toHaveProperty('CI');
  });

  test('generateDiagnostics never throws', () => {
    expect(() => generateDiagnostics()).not.toThrow();
  });

  test('formatDiagnostics returns a valid string', () => {
    const report = generateDiagnostics();
    const output = formatDiagnostics(report);
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(100);
  });

  test('formatDiagnostics contains version and platform', () => {
    const report = generateDiagnostics();
    const output = formatDiagnostics(report);
    expect(output).toContain(report.version);
    expect(output).toContain(report.platform);
  });

  test('formatDiagnosticsMarkdown returns string with details section', () => {
    const report = generateDiagnostics();
    const output = formatDiagnosticsMarkdown(report);
    expect(typeof output).toBe('string');
    expect(output).toContain('<details>');
    expect(output).toContain('```json');
  });

  test('formatDiagnosticsMarkdown contains version string', () => {
    const report = generateDiagnostics();
    const output = formatDiagnosticsMarkdown(report);
    expect(output).toContain(`v${report.version}`);
  });

  test('formatDiagnosticsMarkdown is valid for GitHub', () => {
    const report = generateDiagnostics();
    const output = formatDiagnosticsMarkdown(report);
    expect(output).toContain('### Forge Agent Diagnostics');
    // Check for JSON block
    expect(output).toMatch(/```json\n\{[\s\S]*\}\n```/);
  });

});
