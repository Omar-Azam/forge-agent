// tests/errors.test.js — Day 6: Structured error system tests
'use strict';

const {
  AgentError,
  Errors,
  classifyFsError,
  classifyCommandError,
  displayError,
} = require('../src/errors');

// ─────────────────────────────────────────────────────────
//  AgentError base class
// ─────────────────────────────────────────────────────────

describe('AgentError', () => {
  test('constructs with what/why/how fields', () => {
    const err = new AgentError('What happened', 'Why it failed', ['Fix step 1', 'Fix step 2']);
    expect(err.what).toBe('What happened');
    expect(err.why).toBe('Why it failed');
    expect(err.how).toEqual(['Fix step 1', 'Fix step 2']);
  });

  test('extends Error so it is catchable with try/catch', () => {
    const err = new AgentError('test', 'reason', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentError);
  });

  test('has name AgentError', () => {
    const err = new AgentError('x', 'y', []);
    expect(err.name).toBe('AgentError');
  });

  test('accepts a single string for how (not array)', () => {
    const err = new AgentError('x', 'y', 'single fix');
    expect(Array.isArray(err.how)).toBe(true);
    expect(err.how).toHaveLength(1);
  });

  test('accepts empty how array', () => {
    const err = new AgentError('x', 'y', []);
    expect(err.how).toEqual([]);
  });

  test('format() returns a non-empty string', () => {
    const err = new AgentError('Something broke', 'Permission denied', ['Fix A', 'Fix B']);
    const formatted = err.format();
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  test('format() contains what, why, and how content', () => {
    const err = new AgentError('What broke', 'The reason', ['Step one', 'Step two']);
    const formatted = err.format();
    // Strip ANSI codes for easier assertion
    const plain = formatted.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('What broke');
    expect(plain).toContain('The reason');
    expect(plain).toContain('Step one');
    expect(plain).toContain('Step two');
  });

  test('toToolString() returns compact string for AI feedback', () => {
    const err = new AgentError('File missing', 'Does not exist', ['Check path']);
    const s = err.toToolString();
    expect(s).toContain('File missing');
    expect(s).toContain('Does not exist');
    expect(s).toContain('Check path');
    // Should be compact — no ANSI, no multi-line formatting
    expect(s).not.toMatch(/\x1b\[/);
  });

  test('stores cause error', () => {
    const cause = new Error('original');
    const err   = new AgentError('wrapped', 'reason', [], cause);
    expect(err.cause).toBe(cause);
  });
});

// ─────────────────────────────────────────────────────────
//  Errors factory — file system errors
// ─────────────────────────────────────────────────────────

describe('Errors.fileNotFound', () => {
  test('creates AgentError with path in message', () => {
    const err = Errors.fileNotFound('/home/user/missing.txt');
    expect(err).toBeInstanceOf(AgentError);
    expect(err.what).toContain('missing.txt');
  });

  test('how includes suggestions to list and find', () => {
    const err = Errors.fileNotFound('src/app.js');
    const how = err.how.join(' ');
    expect(how).toMatch(/list_directory|find_files/i);
  });
});

describe('Errors.pathIsDirectory', () => {
  test('creates AgentError mentioning the path', () => {
    const err = Errors.pathIsDirectory('/home/user/mydir');
    expect(err.what).toContain('mydir');
  });

  test('suggests list_directory', () => {
    const err = Errors.pathIsDirectory('/tmp');
    expect(err.how.join(' ')).toContain('list_directory');
  });
});

describe('Errors.directoryNotFound', () => {
  test('suggests create_directory', () => {
    const err = Errors.directoryNotFound('/tmp/missing');
    expect(err.how.join(' ')).toContain('create_directory');
  });
});

describe('Errors.permissionDenied', () => {
  test('includes operation in message', () => {
    const err = Errors.permissionDenied('/etc/passwd', 'write');
    expect(err.what).toContain('write');
    expect(err.what).toContain('/etc/passwd');
  });

  test('how includes chmod suggestion', () => {
    const err = Errors.permissionDenied('/etc/passwd', 'write');
    expect(err.how.join(' ')).toMatch(/chmod/);
  });
});

// ─────────────────────────────────────────────────────────
//  Errors factory — command errors
// ─────────────────────────────────────────────────────────

describe('Errors.commandFailed', () => {
  test('includes exit code and command', () => {
    const err = Errors.commandFailed('npm test', 1, '', 'Test failed');
    expect(err.what).toContain('exit 1');
    expect(err.what).toContain('npm test');
  });

  test('includes stderr in why when provided', () => {
    const err = Errors.commandFailed('bad-cmd', 127, '', 'command not found');
    expect(err.why).toContain('command not found');
  });
});

describe('Errors.commandTimeout', () => {
  test('shows timeout in seconds', () => {
    const err = Errors.commandTimeout('sleep 100', 30000);
    expect(err.what).toContain('30s');
  });

  test('suggests increasing timeout', () => {
    const err = Errors.commandTimeout('slow-cmd', 60000);
    expect(err.how.join(' ')).toMatch(/timeout/i);
  });
});

describe('Errors.commandNotFound', () => {
  test('extracts tool name from command', () => {
    const err = Errors.commandNotFound('python3 script.py');
    expect(err.why).toContain('python3');
  });

  test('suggests install', () => {
    const err = Errors.commandNotFound('docker run');
    expect(err.how.join(' ')).toMatch(/install/i);
  });
});

// ─────────────────────────────────────────────────────────
//  Errors factory — browser / DeepSeek errors
// ─────────────────────────────────────────────────────────

describe('Errors.browserLaunchFailed', () => {
  test('creates AgentError', () => {
    const err = Errors.browserLaunchFailed(new Error('spawn failed'));
    expect(err).toBeInstanceOf(AgentError);
  });

  test('suggests installing playwright', () => {
    const err = Errors.browserLaunchFailed(null);
    expect(err.how.join(' ')).toMatch(/playwright install chromium/i);
  });
});

describe('Errors.inputNotFound', () => {
  test('suggests calibrate command', () => {
    const err = Errors.inputNotFound();
    expect(err.how.join(' ')).toMatch(/calibrate/i);
  });
});

describe('Errors.loginRequired', () => {
  test('mentions headless in how', () => {
    const err = Errors.loginRequired();
    expect(err.how.join(' ')).toMatch(/headless/i);
  });
});

describe('Errors.responseTimeout', () => {
  test('shows timeout in seconds', () => {
    const err = Errors.responseTimeout(180000);
    expect(err.what).toContain('180s');
  });

  test('suggests increasing RESPONSE_TIMEOUT', () => {
    const err = Errors.responseTimeout(60000);
    expect(err.how.join(' ')).toMatch(/RESPONSE_TIMEOUT/);
  });
});

describe('Errors.maxIterationsReached', () => {
  test('shows iteration count', () => {
    const err = Errors.maxIterationsReached(40);
    expect(err.what).toContain('40');
  });

  test('toToolString is usable for AI feedback', () => {
    const err = Errors.maxIterationsReached(40);
    const s = err.toToolString();
    expect(s.length).toBeGreaterThan(10);
    expect(s).toContain('40');
  });
});

// ─────────────────────────────────────────────────────────
//  Errors factory — tool errors
// ─────────────────────────────────────────────────────────

describe('Errors.unknownTool', () => {
  test('includes tool name', () => {
    const err = Errors.unknownTool('magic_tool', ['read_file', 'write_file']);
    expect(err.what).toContain('magic_tool');
  });

  test('lists available tools in how', () => {
    const err = Errors.unknownTool('bad_tool', ['read_file', 'write_file', 'run_command']);
    expect(err.how.join(' ')).toMatch(/read_file|write_file/);
  });
});

describe('Errors.invalidToolArgs', () => {
  test('includes tool name and param name', () => {
    const err = Errors.invalidToolArgs('write_file', 'content', 'string', 42);
    expect(err.what).toContain('write_file');
    expect(err.what).toContain('content');
  });

  test('shows received type', () => {
    const err = Errors.invalidToolArgs('read_file', 'path', 'string', null);
    expect(err.why).toContain('null');
  });
});

// ─────────────────────────────────────────────────────────
//  Errors factory — network errors
// ─────────────────────────────────────────────────────────

describe('Errors.urlFetchFailed', () => {
  test('includes URL in message', () => {
    const err = Errors.urlFetchFailed('https://example.com', new Error('ECONNREFUSED'));
    expect(err.what).toContain('example.com');
  });

  test('suggests checking connection', () => {
    const err = Errors.urlFetchFailed('https://x.com', null);
    expect(err.how.join(' ')).toMatch(/internet|connection/i);
  });
});

// ─────────────────────────────────────────────────────────
//  classifyFsError
// ─────────────────────────────────────────────────────────

describe('classifyFsError', () => {
  function makeErr(code) {
    const e = new Error('fs error');
    e.code  = code;
    return e;
  }

  test('ENOENT → fileNotFound', () => {
    const result = classifyFsError(makeErr('ENOENT'), '/tmp/x.txt', 'read');
    expect(result).toBeInstanceOf(AgentError);
    expect(result.what).toMatch(/not found/i);
  });

  test('ENOENT + readdir → directoryNotFound', () => {
    const result = classifyFsError(makeErr('ENOENT'), '/tmp/dir', 'readdir');
    expect(result.what).toMatch(/directory/i);
  });

  test('EACCES → permissionDenied', () => {
    const result = classifyFsError(makeErr('EACCES'), '/etc/passwd', 'read');
    expect(result.what).toMatch(/permission/i);
  });

  test('EISDIR → pathIsDirectory', () => {
    const result = classifyFsError(makeErr('EISDIR'), '/tmp', 'read');
    expect(result.what).toMatch(/Cannot read file/i);
    expect(result.why).toMatch(/directory/i);
  });

  test('ENOTDIR → pathIsNotDirectory', () => {
    const result = classifyFsError(makeErr('ENOTDIR'), '/tmp/file.txt', 'readdir');
    expect(result.what).toMatch(/not a directory/i);
  });

  test('ENOSPC → diskFull', () => {
    const result = classifyFsError(makeErr('ENOSPC'), '/tmp/big.txt', 'write');
    expect(result.what).toMatch(/disk|write/i);
  });

  test('unknown code → generic AgentError', () => {
    const result = classifyFsError(makeErr('UNKNOWN_CODE'), '/tmp/x', 'read');
    expect(result).toBeInstanceOf(AgentError);
  });

  test('passes through AgentError unchanged', () => {
    const original = new AgentError('already structured', 'reason', []);
    const result   = classifyFsError(original, '/tmp/x');
    expect(result).toBe(original);
  });
});

// ─────────────────────────────────────────────────────────
//  classifyCommandError
// ─────────────────────────────────────────────────────────

describe('classifyCommandError', () => {
  function makeErr({ code, status, signal, stderr, stdout } = {}) {
    const e    = new Error('exec error');
    e.code     = code;
    e.status   = status;
    e.signal   = signal;
    e.stderr   = Buffer.from(stderr || '');
    e.stdout   = Buffer.from(stdout || '');
    return e;
  }

  test('SIGTERM → commandTimeout', () => {
    const result = classifyCommandError(makeErr({ signal: 'SIGTERM' }), 'sleep 100');
    expect(result.what).toMatch(/timed out/i);
  });

  test('command not found in stderr → commandNotFound', () => {
    const result = classifyCommandError(
      makeErr({ status: 127, stderr: 'bash: myapp: command not found' }),
      'myapp --version'
    );
    expect(result.what).toMatch(/not found/i);
  });

  test('general failure → commandFailed', () => {
    const result = classifyCommandError(
      makeErr({ status: 1, stderr: 'some error' }),
      'npm test'
    );
    expect(result.what).toMatch(/failed/i);
    expect(result.why).toContain('some error');
  });

  test('passes through AgentError unchanged', () => {
    const original = new AgentError('already', 'structured', []);
    const result   = classifyCommandError(original, 'cmd');
    expect(result).toBe(original);
  });
});

// ─────────────────────────────────────────────────────────
//  displayError
// ─────────────────────────────────────────────────────────

describe('displayError', () => {
  let stderrSpy;
  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => stderrSpy.mockRestore());

  test('writes AgentError formatted output to stderr', () => {
    const err = new AgentError('What', 'Why', ['How']);
    displayError(err);
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0];
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  test('writes plain Error to stderr', () => {
    const err = new Error('plain error message');
    displayError(err);
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0];
    expect(output).toContain('plain error message');
  });

  test('does not throw when called with a plain object', () => {
    const err = new Error('some error');
    expect(() => displayError(err)).not.toThrow();
  });
});
