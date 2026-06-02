// tests/progress.test.js — Day 9: Progress tracker tests
'use strict';

const { ProgressTracker, STEP } = require('../src/progress');

// ─────────────────────────────────────────────────────────
//  STEP constants
// ─────────────────────────────────────────────────────────

describe('STEP constants', () => {
  test('has expected step types', () => {
    expect(STEP.TOOL_CALL).toBe('tool_call');
    expect(STEP.TOOL_RESULT).toBe('tool_result');
    expect(STEP.AI_RESPONSE).toBe('ai_response');
    expect(STEP.ERROR).toBe('error');
    expect(STEP.SYSTEM).toBe('system');
  });
});

// ─────────────────────────────────────────────────────────
//  Constructor
// ─────────────────────────────────────────────────────────

describe('ProgressTracker constructor', () => {
  test('stores the task string', () => {
    const p = new ProgressTracker('build a calculator');
    expect(p.task).toBe('build a calculator');
  });

  test('starts with zero counts', () => {
    const p = new ProgressTracker('task');
    expect(p.toolCallCount).toBe(0);
    expect(p.errorCount).toBe(0);
    expect(p.steps).toHaveLength(0);
  });

  test('starts with empty file sets', () => {
    const p = new ProgressTracker('task');
    expect(p.filesWritten.size).toBe(0);
    expect(p.filesRead.size).toBe(0);
    expect(p.commandsRun).toHaveLength(0);
  });

  test('records startedAt as a recent timestamp', () => {
    const before = Date.now();
    const p      = new ProgressTracker('task');
    const after  = Date.now();
    expect(p.startedAt).toBeGreaterThanOrEqual(before);
    expect(p.startedAt).toBeLessThanOrEqual(after);
  });
});

// ─────────────────────────────────────────────────────────
//  recordToolCall
// ─────────────────────────────────────────────────────────

describe('recordToolCall', () => {
  test('increments toolCallCount', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('read_file', { path: 'src/index.js' });
    expect(p.toolCallCount).toBe(1);
    p.recordToolCall('write_file', { path: 'out.txt', content: 'hi' });
    expect(p.toolCallCount).toBe(2);
  });

  test('adds step of type TOOL_CALL', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('run_command', { command: 'npm test' });
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0].type).toBe(STEP.TOOL_CALL);
    expect(p.steps[0].name).toBe('run_command');
  });

  test('tracks write_file paths in filesWritten', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('write_file', { path: 'src/index.js', content: 'code' });
    expect(p.filesWritten.has('src/index.js')).toBe(true);
  });

  test('tracks write_files batch paths in filesWritten', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('write_files', {
      files: [
        { path: 'a.js', content: '' },
        { path: 'b.js', content: '' },
      ],
    });
    expect(p.filesWritten.has('a.js')).toBe(true);
    expect(p.filesWritten.has('b.js')).toBe(true);
  });

  test('tracks read_file paths in filesRead', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('read_file', { path: 'package.json' });
    expect(p.filesRead.has('package.json')).toBe(true);
  });

  test('tracks run_command commands', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('run_command', { command: 'npm install' });
    expect(p.commandsRun).toContain('npm install');
  });

  test('truncates long commands to 80 chars', () => {
    const p   = new ProgressTracker('task');
    const cmd = 'a'.repeat(200);
    p.recordToolCall('run_command', { command: cmd });
    expect(p.commandsRun[0].length).toBeLessThanOrEqual(80);
  });

  test('does not track other tool types in specific sets', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('list_directory', { path: '.' });
    expect(p.filesWritten.size).toBe(0);
    expect(p.filesRead.size).toBe(0);
    expect(p.commandsRun).toHaveLength(0);
  });

  test('step includes timestamp', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('read_file', { path: 'x.js' });
    expect(typeof p.steps[0].timestamp).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────
//  recordToolResult
// ─────────────────────────────────────────────────────────

describe('recordToolResult', () => {
  test('adds step of type TOOL_RESULT', () => {
    const p = new ProgressTracker('task');
    p.recordToolResult('read_file', '✓ content here', false);
    expect(p.steps[0].type).toBe(STEP.TOOL_RESULT);
  });

  test('increments errorCount on error', () => {
    const p = new ProgressTracker('task');
    p.recordToolResult('write_file', 'Error: permission denied', true);
    expect(p.errorCount).toBe(1);
  });

  test('does not increment errorCount on success', () => {
    const p = new ProgressTracker('task');
    p.recordToolResult('write_file', '✓ written', false);
    expect(p.errorCount).toBe(0);
  });

  test('stores result truncated to 200 chars', () => {
    const p = new ProgressTracker('task');
    p.recordToolResult('read_file', 'x'.repeat(500), false);
    expect(p.steps[0].result.length).toBeLessThanOrEqual(200);
  });
});

// ─────────────────────────────────────────────────────────
//  recordAiResponse
// ─────────────────────────────────────────────────────────

describe('recordAiResponse', () => {
  test('adds step of type AI_RESPONSE', () => {
    const p = new ProgressTracker('task');
    p.recordAiResponse('The task is complete.');
    expect(p.steps[0].type).toBe(STEP.AI_RESPONSE);
  });

  test('stores content truncated to 200 chars', () => {
    const p = new ProgressTracker('task');
    p.recordAiResponse('x'.repeat(500));
    expect(p.steps[0].content.length).toBeLessThanOrEqual(200);
  });
});

// ─────────────────────────────────────────────────────────
//  recordError
// ─────────────────────────────────────────────────────────

describe('recordError', () => {
  test('adds step of type ERROR', () => {
    const p = new ProgressTracker('task');
    p.recordError('Something went wrong');
    expect(p.steps[0].type).toBe(STEP.ERROR);
  });

  test('increments errorCount', () => {
    const p = new ProgressTracker('task');
    p.recordError('error');
    p.recordError('error 2');
    expect(p.errorCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────
//  getStatusLine
// ─────────────────────────────────────────────────────────

describe('getStatusLine', () => {
  test('returns a string', () => {
    const p = new ProgressTracker('task');
    expect(typeof p.getStatusLine()).toBe('string');
  });

  test('includes step count when tools have been called', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('read_file', { path: 'x.js' });
    p.recordToolCall('write_file', { path: 'y.js', content: '' });
    const line = p.getStatusLine();
    expect(line).toContain('2 steps');
  });

  test('includes files written count', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('write_file', { path: 'a.js', content: '' });
    p.recordToolCall('write_file', { path: 'b.js', content: '' });
    expect(p.getStatusLine()).toContain('2 files written');
  });

  test('includes error count when errors occurred', () => {
    const p = new ProgressTracker('task');
    p.recordError('oops');
    expect(p.getStatusLine()).toContain('1 errors');
  });
});

// ─────────────────────────────────────────────────────────
//  hasProgress
// ─────────────────────────────────────────────────────────

describe('hasProgress', () => {
  test('false on fresh tracker', () => {
    const p = new ProgressTracker('task');
    expect(p.hasProgress).toBe(false);
  });

  test('true after a tool call', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('list_directory', { path: '.' });
    expect(p.hasProgress).toBe(true);
  });

  test('true after a file is written', () => {
    const p = new ProgressTracker('task');
    p.recordToolCall('write_file', { path: 'x.js', content: '' });
    expect(p.hasProgress).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
//  elapsedMs
// ─────────────────────────────────────────────────────────

describe('elapsedMs', () => {
  test('returns a positive number', () => {
    const p = new ProgressTracker('task');
    expect(p.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test('increases over time', async () => {
    const p    = new ProgressTracker('task');
    const t1   = p.elapsedMs;
    await new Promise(r => setTimeout(r, 20));
    const t2   = p.elapsedMs;
    expect(t2).toBeGreaterThan(t1);
  });
});

// ─────────────────────────────────────────────────────────
//  buildPartialSummary
// ─────────────────────────────────────────────────────────

describe('buildPartialSummary', () => {
  function buildTracker() {
    const p = new ProgressTracker('Build a REST API with auth and CRUD');
    p.recordToolCall('list_directory', { path: '.' });
    p.recordToolResult('list_directory', '- src/\n- package.json', false);
    p.recordToolCall('write_file', { path: 'src/server.js', content: 'code' });
    p.recordToolResult('write_file', '✓ written', false);
    p.recordToolCall('write_file', { path: 'src/routes.js', content: 'code' });
    p.recordToolResult('write_file', '✓ written', false);
    p.recordToolCall('run_command', { command: 'npm install express' });
    p.recordToolResult('run_command', 'added 5 packages', false);
    p.recordError('Timeout waiting for response');
    return p;
  }

  test('returns a non-empty string', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(50);
  });

  test('includes the task name', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(summary).toContain('Build a REST API');
  });

  test('includes written file paths', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(summary).toContain('src/server.js');
    expect(summary).toContain('src/routes.js');
  });

  test('includes commands run', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(summary).toContain('npm install express');
  });

  test('mentions error count', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(summary).toContain('1 error');
  });

  test('includes resume instructions', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(summary.toLowerCase()).toContain('resume');
  });

  test('mentions RESPONSE_TIMEOUT for timeout reason', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    expect(summary).toContain('RESPONSE_TIMEOUT');
  });

  test('mentions MAX_ITERATIONS for max_iterations reason', () => {
    const p       = buildTracker();
    const summary = p.buildPartialSummary('max_iterations');
    expect(summary).toContain('MAX_ITERATIONS');
  });

  test('works on empty tracker with no steps', () => {
    const p       = new ProgressTracker('empty task');
    const summary = p.buildPartialSummary('timeout');
    expect(typeof summary).toBe('string');
    expect(summary).toContain('empty task');
  });

  test('handles large file count gracefully', () => {
    const p = new ProgressTracker('task');
    for (let i = 0; i < 20; i++) {
      p.recordToolCall('write_file', { path: `file${i}.js`, content: '' });
    }
    const summary = p.buildPartialSummary('timeout');
    // Should mention truncation
    expect(summary).toMatch(/and \d+ more/);
  });

  test('includes accomplished steps summary', () => {
    const p = buildTracker();
    const summary = p.buildPartialSummary('timeout');
    // Should have a COMPLETED section with write/read/command info
    expect(summary).toContain('COMPLETED');
  });
});
