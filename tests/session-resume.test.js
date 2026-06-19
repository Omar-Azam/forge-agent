// tests/session-resume.test.js — Test suite for Session Resume logic
'use strict';

const { 
  buildResumeContext, 
  printResumeHeader, 
  selectFromHistory 
} = require('../src/session-resume');
const logger = require('../src/logger');

describe('Session Resume Logic', () => {
  
  test('src/session-resume.js exports buildResumeContext function', () => {
    expect(typeof buildResumeContext).toBe('function');
  });

  test('src/session-resume.js exports printResumeHeader function', () => {
    expect(typeof printResumeHeader).toBe('function');
  });

  test('src/session-resume.js exports selectFromHistory function', () => {
    expect(typeof selectFromHistory).toBe('function');
  });

  test('buildResumeContext returns non-empty string', () => {
    const entry = { task: 'test', filesWritten: [], stepsCount: 5, status: 'partial' };
    const context = buildResumeContext(entry);
    expect(typeof context).toBe('string');
    expect(context.length).toBeGreaterThan(0);
  });

  test('buildResumeContext includes original task text', () => {
    const entry = { task: 'build a calculator' };
    const context = buildResumeContext(entry);
    expect(context).toContain('build a calculator');
  });

  test('buildResumeContext includes files written list when present', () => {
    const entry = { task: 't', filesWritten: ['index.html', 'style.css'] };
    const context = buildResumeContext(entry);
    expect(context).toContain('index.html, style.css');
  });

  test('buildResumeContext includes steps count', () => {
    const entry = { task: 't', stepsCount: 12 };
    const context = buildResumeContext(entry);
    expect(context).toContain('Steps taken: 12');
  });

  test('buildResumeContext includes status when stopped', () => {
    const entry = { task: 't', status: 'timeout' };
    const context = buildResumeContext(entry);
    expect(context).toContain('Status when stopped: timeout');
  });

  test('buildResumeContext handles entry with no filesWritten (empty array)', () => {
    const entry = { task: 't', filesWritten: [] };
    const context = buildResumeContext(entry);
    expect(context).toContain('Files written: None');
  });

  test('buildResumeContext handles entry with no commandsRun', () => {
    const entry = { task: 't', commandsRun: [] };
    const context = buildResumeContext(entry);
    expect(context).toContain('Commands run: None');
  });

  test('buildResumeContext never throws for empty/null entry', () => {
    expect(() => buildResumeContext(null)).not.toThrow();
    expect(() => buildResumeContext({})).not.toThrow();
  });

  test('buildResumeContext returns a string even for completely empty object', () => {
    const context = buildResumeContext({});
    expect(typeof context).toBe('string');
  });

  test('printResumeHeader does not throw for valid entry', () => {
    const entry = { task: 't', filesWritten: ['f1'], stepsCount: 2, status: 'partial' };
    const mockLogger = { info: jest.fn(), dim: jest.fn() };
    expect(() => printResumeHeader(entry, mockLogger)).not.toThrow();
    expect(mockLogger.info).toHaveBeenCalled();
  });

  test('printResumeHeader does not throw for empty entry', () => {
    const mockLogger = { info: jest.fn(), dim: jest.fn() };
    expect(() => printResumeHeader({}, mockLogger)).not.toThrow();
  });

  test('selectFromHistory returns null immediately when entries array is empty', async () => {
    const result = await selectFromHistory([]);
    expect(result).toBeNull();
  });

  test('selectFromHistory returns null immediately when entries is null', async () => {
    const result = await selectFromHistory(null);
    expect(result).toBeNull();
  });
});
