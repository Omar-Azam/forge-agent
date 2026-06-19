// src/env-manager.js — Safe .env file management
//
// Security first: values that look like secrets are MASKED before
// being returned to the AI. The AI sees keys and structure, never the
// actual secret values. Users can opt-in to revealing specific values.
//
// Supports: .env, .env.local, .env.development, .env.production, etc.
//
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
//  Secret detection heuristics
// ─────────────────────────────────────────────

// Key name patterns that almost always contain secrets
const SECRET_KEY_PATTERNS = [
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /api_key/i,
  /apikey/i,
  /access_key/i,
  /private_key/i,
  /auth/i,
  /credential/i,
  /signing/i,
  /encryption/i,
  /jwt/i,
  /oauth/i,
  /client_secret/i,
  /webhook/i,
  /stripe/i,
  /twilio/i,
  /sendgrid/i,
  /mailgun/i,
  /firebase/i,
  /aws_secret/i,
  /gcp_key/i,
];

// Value patterns that look like secrets (long random strings, keys, etc.)
const SECRET_VALUE_PATTERNS = [
  /^[A-Za-z0-9+/]{40,}={0,2}$/, // base64 (40+ chars)
  /^[a-f0-9]{32,}$/i,            // hex strings (MD5, SHA1, etc.)
  /^sk-[A-Za-z0-9]{20,}$/,       // OpenAI-style keys
  /^[A-Z0-9]{20,}$/,             // AWS-style keys
  /^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, // JWT tokens
  /^ghp_[A-Za-z0-9]{36}$/,       // GitHub tokens
  /^xoxb-[0-9-]+/,               // Slack bot tokens
  /^SG\.[A-Za-z0-9._-]{20,}$/,   // SendGrid keys
];

// Values that are clearly NOT secrets
const SAFE_VALUE_PATTERNS = [
  /^(true|false|yes|no|on|off)$/i,
  /^\d+$/,                           // pure numbers (port, timeout, etc.)
  /^https?:\/\//,                    // URLs — not secret
  /^localhost/i,
  /^(development|production|staging|test|dev|prod)$/i,
  /^[a-z][a-z0-9_-]{0,14}$/,        // short simple identifiers (max 15 chars)
];

/**
 * Determine if a key=value pair should be masked.
 */
function isSecret(key, value) {
  // Empty or very short values are not secrets
  if (!value || value.length < 8) return false;

  // Explicitly safe values
  if (SAFE_VALUE_PATTERNS.some(re => re.test(value))) return false;

  // Check key name
  if (SECRET_KEY_PATTERNS.some(re => re.test(key))) return true;

  // Check value pattern
  if (SECRET_VALUE_PATTERNS.some(re => re.test(value))) return true;

  // Long values (> 30 chars) with mixed case and special chars are likely secrets
  if (value.length > 30 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value)) {
    return true;
  }

  return false;
}

function maskValue(value) {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 20)) + value.slice(-2);
}

// ─────────────────────────────────────────────
//  .env file parser
// ─────────────────────────────────────────────

/**
 * Parse a .env file into an array of entries.
 * Preserves comments, blank lines, and ordering.
 *
 * Returns: Array<{ type: 'comment'|'blank'|'var', key?, value?, raw }>
 */
function parseEnvFile(content) {
  const entries = [];
  const rawLines = content.split('\n');

  // Remove the last element if it's empty (artifact of trailing newline)
  if (rawLines[rawLines.length - 1] === '') rawLines.pop();

  for (const raw of rawLines) {
    const trimmed = raw.trim();

    if (trimmed === '') {
      entries.push({ type: 'blank', raw });
      continue;
    }

    if (trimmed.startsWith('#')) {
      entries.push({ type: 'comment', raw, comment: trimmed.slice(1).trim() });
      continue;
    }

    // KEY=VALUE or KEY="VALUE" or KEY='VALUE'
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      // Bare key with no value
      entries.push({ type: 'var', key: trimmed, value: '', raw });
      continue;
    }

    const key   = trimmed.slice(0, eqIdx).trim();
    let   value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Strip inline comments (value # comment)
    const commentIdx = value.indexOf(' #');
    if (commentIdx !== -1) {
      value = value.slice(0, commentIdx).trim();
    }

    if (key) {
      entries.push({ type: 'var', key, value, raw });
    }
  }

  return entries;
}

/**
 * Serialise entries back to .env file content.
 */
function serialiseEnvFile(entries) {
  return entries.map(e => {
    if (e.type === 'blank')   return '';
    if (e.type === 'comment') return e.raw;
    // Re-quote values with spaces
    const val = e.value.includes(' ') ? `"${e.value}"` : e.value;
    return `${e.key}=${val}`;
  }).join('\n') + '\n';
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Read a .env file and return its variables (with secrets masked).
 *
 * @param {string} filePath   - Path to .env file
 * @param {Object} opts
 * @param {boolean} opts.showSecrets   - Unmask secret values (default: false)
 * @param {string[]} opts.revealKeys   - Specific keys to reveal (partial unmask)
 * @returns {EnvReadResult}
 */
function readEnvFile(filePath, opts = {}) {
  const { showSecrets = false, revealKeys = [] } = opts;

  if (!fs.existsSync(filePath)) {
    return { exists: false, path: filePath, vars: [], masked: 0 };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { exists: false, path: filePath, vars: [], masked: 0, error: err.message };
  }
  const entries = parseEnvFile(content);
  const vars    = [];
  let   masked  = 0;

  for (const entry of entries) {
    if (entry.type !== 'var') continue;

    const shouldMask = !showSecrets &&
                       !revealKeys.includes(entry.key) &&
                       isSecret(entry.key, entry.value);

    if (shouldMask) masked++;

    vars.push({
      key    : entry.key,
      value  : shouldMask ? maskValue(entry.value) : entry.value,
      masked : shouldMask,
      secret : isSecret(entry.key, entry.value),
    });
  }

  return { exists: true, path: filePath, vars, masked };
}

/**
 * Set or update a single variable in a .env file.
 * Creates the file if it doesn't exist.
 *
 * @param {string} filePath   - Path to .env file
 * @param {string} key        - Variable name
 * @param {string} value      - Variable value
 * @param {Object} opts
 * @param {string} opts.comment  - Comment to add above the variable
 * @returns {SetResult}
 */
function setEnvVar(filePath, key, value, opts = {}) {
  const { comment } = opts;

  // Validate key name
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
    throw new Error(
      `Invalid environment variable name: "${key}"\n` +
      'Names must start with a letter or underscore and contain only letters, digits, and underscores.'
    );
  }

  let   entries = [];
  let   action  = 'created';

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      entries = parseEnvFile(content);

      // Check if key already exists
      const existing = entries.find(e => e.type === 'var' && e.key === key);
      if (existing) {
        existing.value = value;
        existing.raw   = `${key}=${value.includes(' ') ? `"${value}"` : value}`;
        action = 'updated';
      } else {
        // Append the new var
        if (comment) {
          entries.push({ type: 'blank', raw: '' });
          entries.push({ type: 'comment', raw: `# ${comment}` });
        }
        entries.push({ type: 'var', key, value, raw: `${key}=${value}` });
      }
    } catch {
      // If read fails, treat as new file
      entries = [{ type: 'var', key, value, raw: `${key}=${value}` }];
    }
  } else {
    // Create new file
    if (comment) {
      entries.push({ type: 'comment', raw: `# ${comment}` });
    }
    entries.push({ type: 'var', key, value, raw: `${key}=${value}` });
  }

  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, serialiseEnvFile(entries), 'utf8');
  } catch (err) {
    throw new Error(`Failed to write .env file: ${err.message}`);
  }

  return {
    action,
    key,
    file: filePath,
    // Never return the actual value — caller decides whether to show it
    masked: isSecret(key, value),
  };
}

/**
 * Delete a variable from a .env file.
 */
function deleteEnvVar(filePath, key) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read .env file: ${err.message}`);
  }

  const entries = parseEnvFile(content);
  const before  = entries.length;

  const filtered = entries.filter(e => !(e.type === 'var' && e.key === key));

  if (filtered.length === before) {
    return { deleted: false, key, message: `Key "${key}" not found in ${filePath}` };
  }

  try {
    fs.writeFileSync(filePath, serialiseEnvFile(filtered), 'utf8');
  } catch (err) {
    throw new Error(`Failed to update .env file: ${err.message}`);
  }
  return { deleted: true, key, file: filePath };
}

/**
 * List all .env files in a directory.
 */
function findEnvFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => /^\.env(\.\w+)?$/.test(f))
      .map(f => path.join(dir, f))
      .sort();
  } catch { return []; }
}

/**
 * Check if all required env vars are present in a file.
 */
function checkRequiredVars(filePath, requiredKeys) {
  const result = readEnvFile(filePath);
  const present = new Set(result.vars.map(v => v.key));
  const missing = requiredKeys.filter(k => !present.has(k));
  return { missing, present: requiredKeys.filter(k => present.has(k)) };
}

// ─────────────────────────────────────────────
//  Format helpers
// ─────────────────────────────────────────────

function formatEnvReadResult(result) {
  if (!result.exists) {
    return `File not found: ${result.path}\nCreate it with set_env_var or write_file.`;
  }

  const lines = [`${result.path} — ${result.vars.length} variable(s)`];

  if (result.masked > 0) {
    lines.push(`⚠ ${result.masked} secret value(s) masked for security`);
  }

  lines.push('');

  for (const v of result.vars) {
    const icon  = v.secret ? '🔒' : '  ';
    const value = v.masked ? v.value + ' (masked)' : v.value;
    lines.push(`${icon} ${v.key}=${value}`);
  }

  return lines.join('\n');
}

module.exports = {
  readEnvFile,
  setEnvVar,
  deleteEnvVar,
  findEnvFiles,
  checkRequiredVars,
  formatEnvReadResult,
  parseEnvFile,
  serialiseEnvFile,
  isSecret,
  maskValue,
};
