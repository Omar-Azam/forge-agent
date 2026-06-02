// tests/health.test.js — Day 8: Session health check tests
'use strict';

jest.mock('../src/logger', () => ({
  info      : jest.fn(),
  success   : jest.fn(),
  warn      : jest.fn(),
  error     : jest.fn(),
  dim       : jest.fn(),
  separator : jest.fn(),
  thinking  : jest.fn(),
  clearLine : jest.fn(),
}));

jest.mock('../src/errors', () => ({
  Errors: {
    loginRequired: () => new Error('Login required'),
  },
}));

const {
  runHealthCheck,
  runHealthCheckWithReAuth,
  STATUS,
  checkPageLoaded,
  checkLoggedIn,
  checkInputAvailable,
  checkNotRateLimited,
  checkNetworkConnectivity,
  checkModelAvailable,
} = require('../src/health');

// ─────────────────────────────────────────────
//  Mock page factory
// ─────────────────────────────────────────────

function makePage(overrides = {}) {
  return {
    evaluate       : jest.fn(),
    waitForTimeout : jest.fn().mockResolvedValue(undefined),
    $              : jest.fn().mockResolvedValue(null),
    querySelector  : jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// Standard "healthy" evaluate responses
function healthyEvaluate(question) {
  // Infer what question is being asked from the function toString
  const fnStr = question.toString();

  if (fnStr.includes('bodyLen')) {
    return { url: 'https://chat.deepseek.com', title: 'DeepSeek', bodyLen: 5000, hasError: false };
  }
  if (fnStr.includes('onLoginPage')) {
    return { onLoginPage: false, hasSessionIndicators: true, url: 'https://chat.deepseek.com' };
  }
  if (fnStr.includes('querySelector')) {
    return true; // input found
  }
  if (fnStr.includes('rate limit') || fnStr.includes('too many')) {
    return false; // not rate limited
  }
  if (fnStr.includes('onLine')) {
    return true; // online
  }
  if (fnStr.includes('maintenance')) {
    return false; // not in maintenance
  }
  return false;
}

// ─────────────────────────────────────────────
//  STATUS constants
// ─────────────────────────────────────────────

describe('STATUS constants', () => {
  test('has PASS, WARN, FAIL', () => {
    expect(STATUS.PASS).toBe('pass');
    expect(STATUS.WARN).toBe('warn');
    expect(STATUS.FAIL).toBe('fail');
  });
});

// ─────────────────────────────────────────────
//  checkPageLoaded
// ─────────────────────────────────────────────

describe('checkPageLoaded', () => {
  test('PASS when page has content', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue({
        url: 'https://chat.deepseek.com', title: 'DeepSeek',
        bodyLen: 5000, hasError: false,
      }),
    });
    const r = await checkPageLoaded(page);
    expect(r.status).toBe(STATUS.PASS);
    expect(r.name).toBe('Page loaded');
  });

  test('FAIL when body is nearly empty', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue({
        url: 'https://chat.deepseek.com', title: '', bodyLen: 50, hasError: false,
      }),
    });
    const r = await checkPageLoaded(page);
    expect(r.status).toBe(STATUS.FAIL);
    expect(r.fix).toBeTruthy();
  });

  test('WARN when on unexpected URL with error', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue({
        url: 'https://example.com/error', title: 'Error',
        bodyLen: 500, hasError: true,
      }),
    });
    const r = await checkPageLoaded(page);
    expect(r.status).toBe(STATUS.WARN);
  });

  test('FAIL when evaluate throws', async () => {
    const page = makePage({
      evaluate: jest.fn().mockRejectedValue(new Error('execution context destroyed')),
    });
    const r = await checkPageLoaded(page);
    expect(r.status).toBe(STATUS.FAIL);
    expect(r.fix).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
//  checkLoggedIn
// ─────────────────────────────────────────────

describe('checkLoggedIn', () => {
  test('PASS when session indicators are present', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue({
        onLoginPage: false, hasSessionIndicators: true,
        url: 'https://chat.deepseek.com',
      }),
    });
    const r = await checkLoggedIn(page);
    expect(r.status).toBe(STATUS.PASS);
  });

  test('FAIL when on login page', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue({
        onLoginPage: true, hasSessionIndicators: false,
        url: 'https://chat.deepseek.com/auth/login',
      }),
    });
    const r = await checkLoggedIn(page);
    expect(r.status).toBe(STATUS.FAIL);
    expect(r.message).toMatch(/login page/i);
    expect(r.fix).toMatch(/log in/i);
  });

  test('WARN when session state is ambiguous', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue({
        onLoginPage: false, hasSessionIndicators: false,
        url: 'https://chat.deepseek.com',
      }),
    });
    const r = await checkLoggedIn(page);
    expect(r.status).toBe(STATUS.WARN);
  });

  test('WARN when evaluate throws', async () => {
    const page = makePage({
      evaluate: jest.fn().mockRejectedValue(new Error('page closed')),
    });
    const r = await checkLoggedIn(page);
    expect(r.status).toBe(STATUS.WARN);
  });
});

// ─────────────────────────────────────────────
//  checkInputAvailable
// ─────────────────────────────────────────────

describe('checkInputAvailable', () => {
  test('PASS when input element found', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(true),
    });
    const r = await checkInputAvailable(page);
    expect(r.status).toBe(STATUS.PASS);
    expect(r.message).toContain('Found via');
  });

  test('WARN when no input found', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(false),
    });
    const r = await checkInputAvailable(page);
    expect(r.status).toBe(STATUS.WARN);
    expect(r.fix).toMatch(/calibrate/i);
  });

  test('WARN when all selectors throw', async () => {
    const page = makePage({
      evaluate: jest.fn().mockRejectedValue(new Error('context lost')),
    });
    const r = await checkInputAvailable(page);
    expect(r.status).toBe(STATUS.WARN);
  });

  test('PASS on first matching selector without trying all', async () => {
    let callCount = 0;
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async () => {
        callCount++;
        return true; // first selector matches
      }),
    });
    await checkInputAvailable(page);
    expect(callCount).toBe(1); // stopped after first match
  });
});

// ─────────────────────────────────────────────
//  checkNotRateLimited
// ─────────────────────────────────────────────

describe('checkNotRateLimited', () => {
  test('PASS when no rate limit text', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(false),
    });
    const r = await checkNotRateLimited(page);
    expect(r.status).toBe(STATUS.PASS);
  });

  test('WARN when rate limit text detected', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(true),
    });
    const r = await checkNotRateLimited(page);
    expect(r.status).toBe(STATUS.WARN);
    expect(r.message).toMatch(/rate.limit/i);
    expect(r.fix).toMatch(/wait/i);
  });

  test('WARN when evaluate throws', async () => {
    const page = makePage({
      evaluate: jest.fn().mockRejectedValue(new Error('crash')),
    });
    const r = await checkNotRateLimited(page);
    expect(r.status).toBe(STATUS.WARN);
  });
});

// ─────────────────────────────────────────────
//  checkNetworkConnectivity
// ─────────────────────────────────────────────

describe('checkNetworkConnectivity', () => {
  test('PASS when browser reports online', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(true),
    });
    const r = await checkNetworkConnectivity(page);
    expect(r.status).toBe(STATUS.PASS);
  });

  test('FAIL when browser reports offline', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(false),
    });
    const r = await checkNetworkConnectivity(page);
    expect(r.status).toBe(STATUS.FAIL);
    expect(r.fix).toMatch(/internet/i);
  });

  test('WARN when evaluate throws', async () => {
    const page = makePage({
      evaluate: jest.fn().mockRejectedValue(new Error('no context')),
    });
    const r = await checkNetworkConnectivity(page);
    expect(r.status).toBe(STATUS.WARN);
  });
});

// ─────────────────────────────────────────────
//  checkModelAvailable
// ─────────────────────────────────────────────

describe('checkModelAvailable', () => {
  test('PASS when no maintenance text', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(false),
    });
    const r = await checkModelAvailable(page);
    expect(r.status).toBe(STATUS.PASS);
  });

  test('WARN when maintenance text detected', async () => {
    const page = makePage({
      evaluate: jest.fn().mockResolvedValue(true),
    });
    const r = await checkModelAvailable(page);
    expect(r.status).toBe(STATUS.WARN);
    expect(r.fix).toMatch(/status\.deepseek/i);
  });

  test('WARN when evaluate throws', async () => {
    const page = makePage({
      evaluate: jest.fn().mockRejectedValue(new Error('crash')),
    });
    const r = await checkModelAvailable(page);
    expect(r.status).toBe(STATUS.WARN);
  });
});

// ─────────────────────────────────────────────
//  runHealthCheck — aggregated report
// ─────────────────────────────────────────────

describe('runHealthCheck', () => {
  function makeHealthyPage() {
    return makePage({
      evaluate: jest.fn().mockImplementation(async (fn) => {
        const s = fn.toString();
        if (s.includes('bodyLen'))     return { url: 'https://chat.deepseek.com', title: 'DeepSeek', bodyLen: 5000, hasError: false };
        if (s.includes('onLoginPage')) return { onLoginPage: false, hasSessionIndicators: true, url: 'https://chat.deepseek.com' };
        if (s.includes('onLine'))      return true;
        return false; // rate limit, maintenance → false = good
      }),
    });
  }

  test('returns a report with checks array', async () => {
    const page = makeHealthyPage();
    const report = await runHealthCheck(page, { silent: true });
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBe(6);
  });

  test('report has passed/warned/failed counts', async () => {
    const page = makeHealthyPage();
    const report = await runHealthCheck(page, { silent: true });
    expect(typeof report.passed).toBe('number');
    expect(typeof report.warned).toBe('number');
    expect(typeof report.failed).toBe('number');
    expect(report.passed + report.warned + report.failed).toBe(6);
  });

  test('healthy is true when no failures', async () => {
    const page = makeHealthyPage();
    const report = await runHealthCheck(page, { silent: true });
    expect(report.healthy).toBe(true);
    expect(report.failed).toBe(0);
  });

  test('healthy is false when any check fails', async () => {
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async (fn) => {
        const s = fn.toString();
        if (s.includes('bodyLen')) return { url: 'https://chat.deepseek.com', title: '', bodyLen: 10, hasError: false };
        if (s.includes('onLoginPage')) return { onLoginPage: false, hasSessionIndicators: true, url: '' };
        if (s.includes('onLine')) return true;
        return false;
      }),
    });
    const report = await runHealthCheck(page, { silent: true });
    expect(report.healthy).toBe(false);
    expect(report.failed).toBeGreaterThan(0);
  });

  test('each check result has status, name, message', async () => {
    const page = makeHealthyPage();
    const report = await runHealthCheck(page, { silent: true });
    report.checks.forEach(check => {
      expect(['pass', 'warn', 'fail']).toContain(check.status);
      expect(typeof check.name).toBe('string');
      expect(typeof check.message).toBe('string');
    });
  });

  test('runs all 6 checks', async () => {
    const page = makeHealthyPage();
    const report = await runHealthCheck(page, { silent: true });
    const names = report.checks.map(c => c.name);
    expect(names).toContain('Page loaded');
    expect(names).toContain('Logged in');
    expect(names).toContain('Input box');
    expect(names).toContain('Rate limit');
    expect(names).toContain('Network');
    expect(names).toContain('Service status');
  });
});

// ─────────────────────────────────────────────
//  runHealthCheckWithReAuth
// ─────────────────────────────────────────────

describe('runHealthCheckWithReAuth', () => {
  function makeLoggedInPage() {
    return makePage({
      evaluate: jest.fn().mockImplementation(async (fn) => {
        const s = fn.toString();
        if (s.includes('bodyLen'))     return { url: 'https://chat.deepseek.com', title: 'DeepSeek', bodyLen: 5000, hasError: false };
        if (s.includes('onLoginPage')) return { onLoginPage: false, hasSessionIndicators: true, url: 'https://chat.deepseek.com' };
        if (s.includes('onLine'))      return true;
        return false;
      }),
    });
  }

  test('does not call reLogin when already logged in', async () => {
    const page    = makeLoggedInPage();
    const reLogin = jest.fn();
    await runHealthCheckWithReAuth(page, reLogin);
    expect(reLogin).not.toHaveBeenCalled();
  });

  test('calls reLogin when login check fails', async () => {
    let loginCallCount = 0;
    const page = makePage({
      evaluate: jest.fn().mockImplementation(async (fn) => {
        const s = fn.toString();
        if (s.includes('bodyLen'))     return { url: 'https://chat.deepseek.com', title: 'DeepSeek', bodyLen: 5000, hasError: false };
        if (s.includes('onLoginPage')) {
          loginCallCount++;
          // First call: logged out. Second call (re-check): logged in.
          return loginCallCount === 1
            ? { onLoginPage: true, hasSessionIndicators: false, url: '/auth/login' }
            : { onLoginPage: false, hasSessionIndicators: true, url: 'https://chat.deepseek.com' };
        }
        if (s.includes('onLine'))      return true;
        return false;
      }),
    });

    const reLogin = jest.fn().mockResolvedValue(undefined);
    await runHealthCheckWithReAuth(page, reLogin);
    expect(reLogin).toHaveBeenCalledTimes(1);
  });

  test('returns the health report', async () => {
    const page   = makeLoggedInPage();
    const report = await runHealthCheckWithReAuth(page, jest.fn());
    expect(report).toHaveProperty('checks');
    expect(report).toHaveProperty('healthy');
  });
});
