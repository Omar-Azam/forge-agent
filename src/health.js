// src/health.js — Session health check for DeepSeek Agent
//
// Runs a series of checks after the browser launches but before the first
// message is sent. Catches problems early so they never crash mid-task.
//
'use strict';

const logger = require('./logger');
const { Errors } = require('./errors');

// ─────────────────────────────────────────────
//  Check results
// ─────────────────────────────────────────────

const STATUS = {
  PASS : 'pass',
  WARN : 'warn',
  FAIL : 'fail',
};

function result(status, name, message, fix = null) {
  return { status, name, message, fix };
}

// ─────────────────────────────────────────────
//  Individual checks
// ─────────────────────────────────────────────

/**
 * Check 1 — Page loaded correctly (not blank, not error page)
 */
async function checkPageLoaded(page) {
  try {
    const info = await page.evaluate(() => ({
      url       : window.location.href,
      title     : document.title || '',
      bodyLen   : (document.body?.innerText || '').length,
      hasError  : !!(
        document.querySelector('[class*="error"]') &&
        (document.body?.innerText || '').toLowerCase().includes('error')
      ),
    }));

    if (info.bodyLen < 100) {
      return result(STATUS.FAIL, 'Page loaded',
        'Page body is nearly empty — the page may not have loaded.',
        'Check your internet connection and try again.'
      );
    }

    if (info.hasError && !info.url.includes('chat.deepseek.com')) {
      return result(STATUS.WARN, 'Page loaded',
        `Unexpected page: ${info.url.slice(0, 60)}`,
        'Navigate manually to chat.deepseek.com and try again.'
      );
    }

    return result(STATUS.PASS, 'Page loaded',
      `${info.url.slice(0, 50)} (${info.bodyLen} chars)`
    );
  } catch (err) {
    return result(STATUS.FAIL, 'Page loaded',
      `Could not evaluate page: ${err.message}`,
      'The browser may have crashed. Restart the agent.'
    );
  }
}

/**
 * Check 2 — User is logged in
 */
async function checkLoggedIn(page) {
  try {
    const loginState = await page.evaluate(() => {
      const url      = window.location.href;
      const bodyText = (document.body?.innerText || '').toLowerCase();
      const hasPassInput = !!document.querySelector('input[type="password"]');

      const onLoginPage = (
        url.includes('/auth') ||
        url.includes('/login') ||
        url.includes('/sign') ||
        hasPassInput ||
        bodyText.includes('sign in') ||
        bodyText.includes('log in') ||
        bodyText.includes('create account')
      );

      const hasSessionIndicators = (
        !!document.querySelector('[class*="avatar"]') ||
        !!document.querySelector('[class*="user-info"]') ||
        !!document.querySelector('[class*="sidebar"]') ||
        !!document.querySelector('[class*="chat"]') ||
        url.includes('chat.deepseek.com') && !onLoginPage
      );

      return { onLoginPage, hasSessionIndicators, url };
    });

    if (loginState.onLoginPage) {
      return result(STATUS.FAIL, 'Logged in',
        'DeepSeek login page detected — session has expired or never set.',
        'Log in to DeepSeek in the browser window, then press Enter.'
      );
    }

    if (!loginState.hasSessionIndicators) {
      return result(STATUS.WARN, 'Logged in',
        'Could not confirm active session — page structure unclear.',
        'If the agent fails to send messages, log in manually and restart.'
      );
    }

    return result(STATUS.PASS, 'Logged in', 'Active session detected');
  } catch (err) {
    return result(STATUS.WARN, 'Logged in',
      `Could not check login state: ${err.message}`,
      'If messages fail to send, log in manually.'
    );
  }
}

/**
 * Check 3 — Chat input box is present and visible
 */
async function checkInputAvailable(page) {
  const selectors = [
    '#chat-input',
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ];

  for (const sel of selectors) {
    try {
      const found = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }, sel);

      if (found) {
        return result(STATUS.PASS, 'Input box',
          `Found via: ${sel}`
        );
      }
    } catch {}
  }

  return result(STATUS.WARN, 'Input box',
    'No chat input element found with known selectors.',
    'Run: deepseek-agent --calibrate   to auto-detect new selectors.'
  );
}

/**
 * Check 4 — Not rate limited
 */
async function checkNotRateLimited(page) {
  try {
    const rateLimited = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return (
        text.includes('rate limit') ||
        text.includes('too many requests') ||
        text.includes('please slow down') ||
        text.includes('try again later') ||
        text.includes('quota exceeded')
      );
    });

    if (rateLimited) {
      return result(STATUS.WARN, 'Rate limit',
        'DeepSeek appears to be rate-limiting this account.',
        'Wait a few minutes before running another task.'
      );
    }

    return result(STATUS.PASS, 'Rate limit', 'No rate limiting detected');
  } catch (err) {
    return result(STATUS.WARN, 'Rate limit',
      `Could not check rate limit status: ${err.message}`
    );
  }
}

/**
 * Check 5 — Network connectivity (can reach DeepSeek)
 */
async function checkNetworkConnectivity(page) {
  try {
    const online = await page.evaluate(() => navigator.onLine);
    if (!online) {
      return result(STATUS.FAIL, 'Network',
        'Browser reports offline status.',
        'Check your internet connection.'
      );
    }
    return result(STATUS.PASS, 'Network', 'Browser reports online');
  } catch (err) {
    return result(STATUS.WARN, 'Network',
      `Could not check network status: ${err.message}`
    );
  }
}

/**
 * Check 6 — DeepSeek model is selectable (not in maintenance)
 */
async function checkModelAvailable(page) {
  try {
    const maintenance = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      return (
        text.includes('maintenance') ||
        text.includes('under construction') ||
        text.includes('service unavailable') ||
        text.includes('system update')
      );
    });

    if (maintenance) {
      return result(STATUS.WARN, 'Service status',
        'DeepSeek may be undergoing maintenance.',
        'Check https://status.deepseek.com and try again later.'
      );
    }

    return result(STATUS.PASS, 'Service status', 'No maintenance indicators');
  } catch (err) {
    return result(STATUS.WARN, 'Service status',
      `Could not check service status: ${err.message}`
    );
  }
}

// ─────────────────────────────────────────────
//  Main health check runner
// ─────────────────────────────────────────────

/**
 * Run all health checks against the live page.
 *
 * @param {Object} page      - Playwright page object
 * @param {Object} options
 * @param {boolean} options.silent  - Suppress output (for testing)
 * @returns {Promise<HealthReport>}
 */
async function runHealthCheck(page, options = {}) {
  const { silent = false } = options;

  if (!silent) {
    logger.separator('Session Health Check');
  }

  const checks = await Promise.all([
    checkPageLoaded(page),
    checkLoggedIn(page),
    checkInputAvailable(page),
    checkNotRateLimited(page),
    checkNetworkConnectivity(page),
    checkModelAvailable(page),
  ]);

  const passed  = checks.filter(c => c.status === STATUS.PASS).length;
  const warned  = checks.filter(c => c.status === STATUS.WARN).length;
  const failed  = checks.filter(c => c.status === STATUS.FAIL).length;
  const healthy = failed === 0;

  if (!silent) {
    checks.forEach(check => {
      const icon =
        check.status === STATUS.PASS ? '\x1b[32m✓\x1b[0m' :
        check.status === STATUS.WARN ? '\x1b[33m⚠\x1b[0m' :
                                       '\x1b[31m✗\x1b[0m';
      const name = check.name.padEnd(16);
      console.log(`  ${icon}  ${name} ${check.message}`);
      if (check.fix && check.status !== STATUS.PASS) {
        console.log(`\x1b[90m       → ${check.fix}\x1b[0m`);
      }
    });

    console.log('');

    if (healthy && warned === 0) {
      logger.success(`All ${passed} checks passed — session is healthy`);
    } else if (healthy) {
      logger.warn(`${passed} passed, ${warned} warnings — proceeding with caution`);
    } else {
      logger.error(`${failed} check(s) failed — agent may not work correctly`);
    }

    console.log('');
  }

  return { checks, passed, warned, failed, healthy };
}

/**
 * Run health check and handle login re-auth interactively.
 * Call this from browser.js after launch.
 *
 * @param {Object} page       - Playwright page
 * @param {Function} reLogin  - Async function that prompts user to log in
 */
async function runHealthCheckWithReAuth(page, reLogin) {
  const report = await runHealthCheck(page);

  // If login failed, prompt re-auth then re-run checks
  const loginCheck = report.checks.find(c => c.name === 'Logged in');
  if (loginCheck && loginCheck.status === STATUS.FAIL) {
    await reLogin();
    // Wait for page to settle after login
    await page.waitForTimeout(3_000);
    // Re-run just the login check to confirm
    const recheck = await checkLoggedIn(page);
    if (recheck.status === STATUS.FAIL) {
      throw Errors.loginRequired();
    }
    logger.success('Login confirmed — continuing');
  }

  return report;
}

module.exports = {
  runHealthCheck,
  runHealthCheckWithReAuth,
  STATUS,
  // Export individual checks for testing
  checkPageLoaded,
  checkLoggedIn,
  checkInputAvailable,
  checkNotRateLimited,
  checkNetworkConnectivity,
  checkModelAvailable,
};
