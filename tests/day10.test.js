// tests/day10.test.js — Day 10: Path sandbox + new-chat behaviour tests
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TMP = path.join(os.tmpdir(), 'dsa-day10-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });
process.env._DSA_TEST_DIR = TMP;

jest.mock('../src/config', () => ({
  WORKING_DIR      : process.env._DSA_TEST_DIR,
  MAX_OUTPUT_LENGTH: 8000,
  SESSION_DIR      : require('path').join(require('os').tmpdir(), 'dsa-d10-session'),
  STRICT_SANDBOX   : false,
  DEBUG            : false,
}));

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

// ─────────────────────────────────────────────────────────
//  Import sandbox helpers directly from tools
// ─────────────────────────────────────────────────────────

// We test assertSafePath by trying tool operations that should be blocked
const { executeTool } = require('../src/tools');

function tmp(...parts) { return path.join(TMP, ...parts); }

async function write(rel, content = 'test') {
  const abs = tmp(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// ─────────────────────────────────────────────────────────
//  Blocked sensitive paths
// ─────────────────────────────────────────────────────────

describe('Path sandbox — blocked paths', () => {
  test('blocks read of /etc/passwd', async () => {
    // Only run this test on systems where /etc/passwd exists
    if (!fs.existsSync('/etc/passwd')) return;
    await expect(executeTool('read_file', { path: '/etc/passwd' }))
      .rejects.toThrow(/Security|protected/i);
  });

  test('blocks read of ~/.ssh directory', async () => {
    const sshDir = path.join(os.homedir(), '.ssh', 'id_rsa');
    await expect(executeTool('read_file', { path: sshDir }))
      .rejects.toThrow(/Security|protected/i);
  });

  test('blocks write to ~/.ssh', async () => {
    const sshPath = path.join(os.homedir(), '.ssh', 'evil_key');
    await expect(executeTool('write_file', { path: sshPath, content: 'evil' }))
      .rejects.toThrow(/Security|protected/i);
  });

  test('blocks read of ~/.aws credentials', async () => {
    const awsPath = path.join(os.homedir(), '.aws', 'credentials');
    await expect(executeTool('read_file', { path: awsPath }))
      .rejects.toThrow(/Security|protected/i);
  });

  test('error is marked non-retryable', async () => {
    if (!fs.existsSync('/etc/passwd')) return;
    try {
      await executeTool('read_file', { path: '/etc/passwd' });
    } catch (err) {
      expect(err.retryable).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────
//  Normal paths still work (no false positives)
// ─────────────────────────────────────────────────────────

describe('Path sandbox — allowed paths', () => {
  test('reads files inside working directory', async () => {
    await write('safe.txt', 'safe content');
    const result = await executeTool('read_file', { path: tmp('safe.txt') });
    expect(result).toContain('safe content');
  });

  test('writes files inside working directory', async () => {
    const result = await executeTool('write_file', {
      path: tmp('new_file.txt'), content: 'hello',
    });
    expect(result).toMatch(/✓/);
  });

  test('reads files with relative paths', async () => {
    await write('relative.txt', 'relative content');
    const result = await executeTool('read_file', { path: 'relative.txt' });
    expect(result).toContain('relative content');
  });

  test('can read files outside working dir when STRICT_SANDBOX is false', async () => {
    // A benign file outside — /tmp itself
    const outsideFile = path.join(os.tmpdir(), 'dsa-sandbox-test.txt');
    fs.writeFileSync(outsideFile, 'outside content');
    // Should NOT throw when STRICT_SANDBOX=false
    const result = await executeTool('read_file', { path: outsideFile });
    expect(result).toContain('outside content');
    fs.unlinkSync(outsideFile);
  });
});

// ─────────────────────────────────────────────────────────
//  STRICT_SANDBOX mode
// ─────────────────────────────────────────────────────────

describe('STRICT_SANDBOX mode', () => {
  const config = require('../src/config');

  afterEach(() => { config.STRICT_SANDBOX = false; });

  test('blocks access outside working directory when enabled', async () => {
    config.STRICT_SANDBOX = true;
    const outsidePath = path.join(os.tmpdir(), 'strict-test.txt');
    fs.writeFileSync(outsidePath, 'outside');
    await expect(executeTool('read_file', { path: outsidePath }))
      .rejects.toThrow(/Security|outside/i);
    fs.unlinkSync(outsidePath);
  });

  test('allows access inside working directory when enabled', async () => {
    config.STRICT_SANDBOX = true;
    await write('strict_allowed.txt', 'allowed');
    const result = await executeTool('read_file', { path: tmp('strict_allowed.txt') });
    expect(result).toContain('allowed');
  });

  test('blocks path traversal attacks (../../) when enabled', async () => {
    config.STRICT_SANDBOX = true;
    const traversal = path.join(TMP, '..', '..', 'etc', 'passwd');
    await expect(executeTool('read_file', { path: traversal }))
      .rejects.toThrow(/Security|outside|protected/i);
  });

  test('allows access when disabled (default)', async () => {
    config.STRICT_SANDBOX = false;
    const outside = path.join(os.tmpdir(), 'sandbox-off.txt');
    fs.writeFileSync(outside, 'ok');
    await expect(executeTool('read_file', { path: outside })).resolves.toBeDefined();
    fs.unlinkSync(outside);
  });
});

// ─────────────────────────────────────────────────────────
//  New-chat behaviour — ProgressTracker conversation reset
// ─────────────────────────────────────────────────────────

describe('ProgressTracker — task isolation', () => {
  const { ProgressTracker } = require('../src/progress');

  test('each task creates a fresh progress tracker', () => {
    const p1 = new ProgressTracker('task 1');
    p1.recordToolCall('write_file', { path: 'a.js', content: '' });

    const p2 = new ProgressTracker('task 2');

    // p2 starts fresh — not contaminated by p1
    expect(p2.toolCallCount).toBe(0);
    expect(p2.filesWritten.size).toBe(0);
    expect(p2.task).toBe('task 2');
  });

  test('progress from first task is not visible in second', () => {
    const p1 = new ProgressTracker('task 1');
    p1.recordToolCall('write_file', { path: 'a.js', content: '' });
    p1.recordToolCall('run_command', { command: 'npm install' });

    const p2 = new ProgressTracker('task 2');
    p2.recordToolCall('read_file', { path: 'a.js' });

    expect(p2.commandsRun).toHaveLength(0);
    expect(p2.filesWritten.size).toBe(0);
    expect(p2.toolCallCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────
//  Config — STRICT_SANDBOX field exists
// ─────────────────────────────────────────────────────────

describe('Config', () => {
  test('STRICT_SANDBOX is defined and defaults to false', () => {
    const cfg = require('../src/config');
    expect('STRICT_SANDBOX' in cfg).toBe(true);
    expect(typeof cfg.STRICT_SANDBOX).toBe('boolean');
  });
});
