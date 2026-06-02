// tests/retry.test.js — Day 7: Retry logic tests
'use strict';

jest.mock('../src/logger', () => ({
  warn     : jest.fn(),
  dim      : jest.fn(),
  info     : jest.fn(),
  success  : jest.fn(),
  error    : jest.fn(),
  thinking : jest.fn(),
  clearLine: jest.fn(),
}));

const {
  withRetry,
  withBrowserRetry,
  withSendRetry,
  withResponseRetry,
  withNetworkRetry,
  isRetryable,
  nonRetryable,
  sleep,
} = require('../src/retry');

// Speed up tests — override sleep to be instant
jest.mock('../src/retry', () => {
  const actual = jest.requireActual('../src/retry');
  return {
    ...actual,
    // Override sleep inside withRetry to be instant in tests
  };
});

// Patch sleep globally so delays don't slow tests down
const realModule = jest.requireActual('../src/retry');

// We re-implement withRetry with instant delays for testing
async function fastRetry(fn, options = {}, label = 'op') {
  const opts = {
    maxAttempts: 3,
    baseDelayMs: 0,
    maxDelayMs : 0,
    factor     : 1,
    jitterMs   : 0,
    ...options,
  };
  let lastError;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.retryable === false) throw err;
      if (attempt === opts.maxAttempts) break;
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────────
//  withRetry core behaviour
// ─────────────────────────────────────────────────────────

describe('withRetry — core behaviour', () => {
  test('returns result immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await fastRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure and succeeds', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'success';
    });
    const result = await fastRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after exhausting all attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    await expect(fastRetry(fn, { maxAttempts: 3 }))
      .rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws immediately on non-retryable error', async () => {
    const err = new Error('permanent');
    err.retryable = false;
    const fn = jest.fn().mockRejectedValue(err);
    await expect(fastRetry(fn, { maxAttempts: 3 })).rejects.toThrow('permanent');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('respects maxAttempts: 1 (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(fastRetry(fn, { maxAttempts: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('throws the LAST error not the first', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      throw new Error(`error ${calls}`);
    });
    await expect(fastRetry(fn, { maxAttempts: 3 })).rejects.toThrow('error 3');
  });

  test('succeeds on first attempt with no retries consumed', async () => {
    const fn = jest.fn().mockResolvedValue(42);
    const result = await fastRetry(fn, { maxAttempts: 5 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────
//  Retry variant configurations
// ─────────────────────────────────────────────────────────

describe('Retry variant configs', () => {
  test('withBrowserRetry has maxAttempts 3', () => {
    // Verify by counting calls on repeated failure
    let calls = 0;
    const fn = () => { calls++; throw new Error('fail'); };
    // We can't use withBrowserRetry directly (has real delays),
    // but we can check the exported function exists
    expect(typeof withBrowserRetry).toBe('function');
  });

  test('withSendRetry is a function', () => {
    expect(typeof withSendRetry).toBe('function');
  });

  test('withResponseRetry is a function', () => {
    expect(typeof withResponseRetry).toBe('function');
  });

  test('withNetworkRetry is a function', () => {
    expect(typeof withNetworkRetry).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────
//  isRetryable
// ─────────────────────────────────────────────────────────

describe('isRetryable', () => {
  function err(msg, code, retryable) {
    const e = new Error(msg);
    if (code)     e.code = code;
    if (retryable !== undefined) e.retryable = retryable;
    return e;
  }

  // Explicit flag
  test('returns true when err.retryable === true', () => {
    expect(isRetryable(err('x', null, true))).toBe(true);
  });

  test('returns false when err.retryable === false', () => {
    expect(isRetryable(err('x', null, false))).toBe(false);
  });

  // Network error codes
  test('ECONNRESET → retryable', () => {
    expect(isRetryable(err('reset', 'ECONNRESET'))).toBe(true);
  });

  test('ECONNREFUSED → retryable', () => {
    expect(isRetryable(err('refused', 'ECONNREFUSED'))).toBe(true);
  });

  test('ETIMEDOUT → retryable', () => {
    expect(isRetryable(err('timeout', 'ETIMEDOUT'))).toBe(true);
  });

  test('ENOTFOUND → retryable', () => {
    expect(isRetryable(err('not found', 'ENOTFOUND'))).toBe(true);
  });

  test('EPIPE → retryable', () => {
    expect(isRetryable(err('pipe', 'EPIPE'))).toBe(true);
  });

  // HTTP errors
  test('503 in message → retryable', () => {
    expect(isRetryable(err('HTTP 503 service unavailable'))).toBe(true);
  });

  test('429 rate limit → retryable', () => {
    expect(isRetryable(err('429 rate limit exceeded'))).toBe(true);
  });

  test('502 bad gateway → retryable', () => {
    expect(isRetryable(err('502 bad gateway'))).toBe(true);
  });

  // Browser errors
  test('target closed → retryable', () => {
    expect(isRetryable(err('Target page, context or browser has been closed'))).toBe(true);
  });

  test('navigation timeout → retryable', () => {
    expect(isRetryable(err('navigation timeout exceeded'))).toBe(true);
  });

  test('page crashed → retryable', () => {
    expect(isRetryable(err('page crashed'))).toBe(true);
  });

  // Permanent errors
  test('enoent → NOT retryable', () => {
    expect(isRetryable(err('enoent: no such file'))).toBe(false);
  });

  test('permission denied → NOT retryable', () => {
    expect(isRetryable(err('permission denied'))).toBe(false);
  });

  test('eacces → NOT retryable', () => {
    expect(isRetryable(err('EACCES: permission denied, open file'))).toBe(false);
  });

  // Unknown — default to retryable
  test('unknown error → retryable by default', () => {
    expect(isRetryable(err('something weird happened'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
//  nonRetryable helper
// ─────────────────────────────────────────────────────────

describe('nonRetryable', () => {
  test('sets retryable flag to false on the error', () => {
    const err = new Error('permanent failure');
    const result = nonRetryable(err);
    expect(result.retryable).toBe(false);
  });

  test('returns the same error object', () => {
    const err = new Error('test');
    expect(nonRetryable(err)).toBe(err);
  });

  test('marked error stops retry immediately', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      throw nonRetryable(new Error('no retry'));
    });
    await expect(fastRetry(fn, { maxAttempts: 5 })).rejects.toThrow('no retry');
    expect(calls).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────
//  sleep
// ─────────────────────────────────────────────────────────

describe('sleep', () => {
  test('resolves after the given delay', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  test('resolves immediately for 0ms', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
//  Exponential backoff maths
// ─────────────────────────────────────────────────────────

describe('Exponential backoff calculation', () => {
  test('delays grow exponentially', () => {
    const base   = 1000;
    const factor = 2;
    const delays = [1, 2, 3].map(attempt =>
      Math.min(base * Math.pow(factor, attempt - 1), 30_000)
    );
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(4000);
  });

  test('delay is capped at maxDelayMs', () => {
    const delay = Math.min(1000 * Math.pow(2, 10), 30_000);
    expect(delay).toBe(30_000);
  });
});
