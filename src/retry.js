// src/retry.js — Exponential backoff retry system for Forge Agent
'use strict';

const logger = require('./logger');

// ─────────────────────────────────────────────
//  Default retry config
// ─────────────────────────────────────────────

const DEFAULTS = {
  maxAttempts  : 3,      // total attempts (1 original + 2 retries)
  baseDelayMs  : 1_000,  // initial wait before first retry
  maxDelayMs   : 30_000, // cap on backoff delay
  factor       : 2,      // exponential multiplier
  jitterMs     : 500,    // random jitter to avoid thundering herd
};

// ─────────────────────────────────────────────
//  Core retry function
// ─────────────────────────────────────────────

/**
 * Run an async function with exponential backoff retry.
 *
 * @param {Function} fn           - Async function to attempt
 * @param {Object}   options      - Retry options (see DEFAULTS)
 * @param {string}   label        - Human-readable label for logging
 * @returns {Promise<*>}          - Result of fn on success
 * @throws  {Error}               - Last error if all attempts fail
 */
async function withRetry(fn, options = {}, label = 'operation') {
  const opts = { ...DEFAULTS, ...options };
  let   lastError;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // If the error is marked non-retryable, throw immediately
      if (err.retryable === false) throw err;

      const isLastAttempt = attempt === opts.maxAttempts;
      if (isLastAttempt) break;

      // Calculate delay: base * factor^(attempt-1) + jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.factor, attempt - 1) +
        Math.floor(Math.random() * opts.jitterMs),
        opts.maxDelayMs
      );

      if (process.env.NODE_ENV !== 'test') {
        logger.warn(
          `${label} failed (attempt ${attempt}/${opts.maxAttempts}): ${err.message.slice(0, 80)}`
        );
        logger.dim(`Retrying in ${(delay / 1000).toFixed(1)}s...`);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────
//  Specialised retry wrappers
// ─────────────────────────────────────────────

/**
 * Retry a browser navigation / page action.
 * Uses shorter delays since browser issues are usually transient.
 */
async function withBrowserRetry(fn, label = 'browser action') {
  return withRetry(fn, {
    maxAttempts : 3,
    baseDelayMs : 500,
    maxDelayMs  : 5_000,
    factor      : 2,
    jitterMs    : 200,
  }, label);
}

/**
 * Retry sending a message to DeepSeek.
 * If the input box disappears (e.g. page reload), wait longer.
 */
async function withSendRetry(fn, label = 'send message') {
  return withRetry(fn, {
    maxAttempts : 4,
    baseDelayMs : 1_000,
    maxDelayMs  : 10_000,
    factor      : 2,
    jitterMs    : 300,
  }, label);
}

/**
 * Retry waiting for a response.
 * Uses longer delays since DeepSeek may be rate-limiting.
 */
async function withResponseRetry(fn, label = 'wait for response') {
  return withRetry(fn, {
    maxAttempts : 3,
    baseDelayMs : 3_000,
    maxDelayMs  : 20_000,
    factor      : 2,
    jitterMs    : 1_000,
  }, label);
}

/**
 * Retry a URL fetch.
 * Network errors are common and usually self-resolve quickly.
 */
async function withNetworkRetry(fn, label = 'network request') {
  return withRetry(fn, {
    maxAttempts : 4,
    baseDelayMs : 500,
    maxDelayMs  : 8_000,
    factor      : 2,
    jitterMs    : 200,
  }, label);
}

// ─────────────────────────────────────────────
//  Error classification helpers
// ─────────────────────────────────────────────

/**
 * Returns true for errors that are worth retrying.
 * Returns false for errors that are permanent (wrong path, bad args, etc.)
 */
function isRetryable(err) {
  if (err.retryable === false) return false;
  if (err.retryable === true)  return true;

  const msg = (err.message || '').toLowerCase();

  // Network errors
  if (err.code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
                   'ENOTFOUND', 'EPIPE', 'ECONNABORTED'].includes(err.code)) {
    return true;
  }

  // HTTP 5xx / rate limit
  if (msg.includes('503') || msg.includes('502') || msg.includes('429') ||
      msg.includes('rate limit') || msg.includes('service unavailable')) {
    return true;
  }

  // Transient browser errors
  if (msg.includes('target closed') || msg.includes('execution context') ||
      msg.includes('session closed') || msg.includes('page crashed') ||
      msg.includes('navigation') || msg.includes('timeout')) {
    return true;
  }

  // Permanent errors — don't retry
  if (msg.includes('enoent') || msg.includes('not found') ||
      msg.includes('permission denied') || msg.includes('eacces')) {
    return false;
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Mark an error as non-retryable so withRetry bails immediately.
 */
function nonRetryable(err) {
  err.retryable = false;
  return err;
}

// ─────────────────────────────────────────────
//  Utility
// ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  withRetry,
  withBrowserRetry,
  withSendRetry,
  withResponseRetry,
  withNetworkRetry,
  isRetryable,
  nonRetryable,
  sleep,
};
