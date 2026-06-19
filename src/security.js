// src/security.js — Centralised security utilities for Forge Agent
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

const homedir = os.homedir();

/**
 * All paths that are always blocked regardless of sandbox settings.
 */
const BLOCKED_PATHS = [
  '/etc/passwd', 
  '/etc/shadow', 
  '/etc/sudoers',
  '/etc/hosts',
  path.join(homedir, '.ssh'),
  path.join(homedir, '.gnupg'),
  path.join(homedir, '.aws'),
  path.join(homedir, '.config', 'gcloud'),
  path.join(homedir, '.npmrc'),
  path.join(homedir, '.netrc'),
  path.join(homedir, '.git-credentials'),
  path.join(homedir, '.config', 'gh'),
  path.join(homedir, '.docker', 'config.json'),
];

/**
 * All command patterns that are blocked by default.
 */
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'mkfs',
  ':(){ :|:& };:',
  'dd if=/dev/zero of=/',
];

/**
 * Comprehensive path validation.
 * 
 * @param {string} filePath - The path to validate
 * @param {Object} opts - Validation options
 * @returns {Object} { safe: boolean, reason: string | null }
 */
function validatePath(filePath, opts = {}) {
  const { 
    sandbox = config.STRICT_SANDBOX, 
    workingDir = config.WORKING_DIR
  } = opts;

  try {
    // Fix 3: Null byte injection
    if (filePath.includes('\0')) {
      return { safe: false, reason: 'Security: path contains null byte — rejected' };
    }

    // Fix 1: Path normalisation before validation
    // Use workingDir for relative path resolution to match agent's expected behaviour
    const abs = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(workingDir, filePath);

    // Fix 2: Block additional sensitive paths
    for (const blocked of BLOCKED_PATHS) {
      if (abs === blocked || abs.startsWith(blocked + path.sep)) {
        return { safe: false, reason: `Security: access denied — "${filePath}" matches a protected path.` };
      }
    }

    // Fix 4: Sandbox check
    if (sandbox) {
      const rel = path.relative(workingDir, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { safe: false, reason: `Security: access denied — "${filePath}" is outside the working directory.` };
      }

      // Fix 4: Symlink escape detection
      if (fs.existsSync(abs)) {
        try {
          const real = fs.realpathSync(abs);
          const relReal = path.relative(workingDir, real);
          if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
            return { safe: false, reason: `Security: access denied — symlink points outside the working directory.` };
          }
        } catch (err) {
          // If realpathSync fails (e.g. permission denied), treat as unsafe
          return { safe: false, reason: `Security: could not verify symlink safety: ${err.message}` };
        }
      }
    }

    return { safe: true, reason: null };
  } catch (err) {
    return { safe: false, reason: err.message };
  }
}

/**
 * Command safety check.
 * 
 * @param {string} command - The command to validate
 * @returns {Object} { safe: boolean, reason: string | null }
 */
function validateCommand(command) {
  try {
    for (const pattern of BLOCKED_COMMANDS) {
      if (command.includes(pattern)) {
        return { 
          safe: false, 
          reason: `Security: command blocked — this command could cause irreversible damage.\n` +
                  `If you are sure, set ALLOW_DANGEROUS_COMMANDS: true in config.`
        };
      }
    }
    return { safe: true, reason: null };
  } catch (err) {
    return { safe: false, reason: err.message };
  }
}

/**
 * Redact secrets from text.
 * 
 * @param {string} text - The text to sanitise
 * @returns {string} Sanitised string
 */
function sanitiseOutput(text) {
  if (typeof text !== 'string') return text;
  try {
    let sanitised = text;
    // Fix 9: API key pattern
    sanitised = sanitised.replace(/sk-[A-Za-z0-9]{20,}/g, '[API_KEY]');
    // Fix 9: JWT tokens
    sanitised = sanitised.replace(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '[JWT_TOKEN]');
    // Fix 9: Long hex strings (32+ chars)
    sanitised = sanitised.replace(/[a-f0-9]{32,}/gi, '[HEX_SECRET]');
    // Fix 9: Base64 blobs (40+ chars)
    sanitised = sanitised.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[BASE64_DATA]');
    
    return sanitised;
  } catch (err) {
    return text;
  }
}

/**
 * Check if a file is an environment file.
 */
function isEnvFile(filePath) {
  return /^\.env(\.\w+)?$/.test(path.basename(filePath));
}

/**
 * Check if a file type is sensitive and return a warning if so.
 */
function checkSensitiveFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();
  
  const sensitiveExtensions = ['.pem', '.key', '.p12', '.pfx'];
  const sensitiveNames = ['.secret', '.credentials'];

  if (sensitiveExtensions.includes(ext) || sensitiveNames.some(n => name.endsWith(n))) {
    return `⚠ [SECURITY WARNING: This file may contain sensitive credentials.\n` +
           `   The content below will be sent to the AI. Review carefully.]`;
  }
  return null;
}

/**
 * Generate a security posture report.
 */
function generateSecurityReport() {
  return {
    sandboxEnabled: true, // Basic sandbox (blocked paths) is always enabled
    strictSandbox: !!config.STRICT_SANDBOX,
    blockedPathsCount: BLOCKED_PATHS.length,
    blockedCommandsCount: BLOCKED_COMMANDS.length,
    auditLogEnabled: !!config.AUDIT_LOG,
    allowDangerousCommands: !!config.ALLOW_DANGEROUS_COMMANDS,
    envPlainReadAllowed: !!config.ALLOW_ENV_PLAIN_READ,
    paramValidationEnabled: config.PARAM_VALIDATION !== false,
    lastAuditDate: 'Day 45 — 2026',
  };
}

/**
 * Format the security report for terminal display.
 */
function formatSecurityReport(report) {
  const sandboxMode = report.strictSandbox ? 'STRICT (only working directory)' : 'standard (sensitive paths blocked)';
  
  return [
    '🔒 Forge Agent — Security Posture',
    '────────────────────────────────────',
    `Sandbox mode:           ${sandboxMode}`,
    `Strict sandbox:         ${report.strictSandbox ? 'enabled' : 'disabled'}`,
    `Blocked paths:          ${report.blockedPathsCount} sensitive paths always blocked`,
    `Blocked commands:       ${report.blockedCommandsCount} dangerous commands blocked`,
    `Parameter validation:   ${report.paramValidationEnabled ? 'enabled' : 'disabled'}`,
    `Secret masking:         enabled (.env files auto-masked)`,
    `Audit logging:          ${report.auditLogEnabled ? 'enabled' : 'disabled'}`,
    '────────────────────────────────────',
    'Run forge-agent --security for details'
  ].join('\n');
}

module.exports = {
  BLOCKED_PATHS,
  BLOCKED_COMMANDS,
  validatePath,
  validateCommand,
  sanitiseOutput,
  isEnvFile,
  checkSensitiveFileType,
  generateSecurityReport,
  formatSecurityReport
};
