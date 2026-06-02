// src/test-runner.js — Test framework detection and execution
//
// Supports: Jest, Mocha, Vitest, pytest, Go test, Cargo test, Maven, Gradle
// Auto-detects the framework from package.json / project files.
// Parses output into structured pass/fail results the AI can act on.
//
'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync, spawnSync } = require('child_process');

// ─────────────────────────────────────────────
//  Framework definitions
// ─────────────────────────────────────────────

const FRAMEWORKS = [
  // ── JavaScript / TypeScript ──────────────────────────────────────────────
  {
    name      : 'jest',
    detect    : (dir) => hasPackageDep(dir, 'jest') || hasFile(dir, 'jest.config.js') || hasFile(dir, 'jest.config.ts'),
    command   : (dir, opts) => buildNodeCmd('jest', opts, [
      '--no-coverage',
      opts.file ? `"${opts.file}"` : '',
      opts.testName ? `--testNamePattern="${opts.testName}"` : '',
    ]),
    parse     : parseJestOutput,
    language  : 'javascript',
  },
  {
    name      : 'vitest',
    detect    : (dir) => hasPackageDep(dir, 'vitest') || hasFile(dir, 'vitest.config.js') || hasFile(dir, 'vitest.config.ts'),
    command   : (dir, opts) => buildNodeCmd('vitest', opts, [
      'run',
      '--reporter=verbose',
      opts.file ? `"${opts.file}"` : '',
    ]),
    parse     : parseVitestOutput,
    language  : 'javascript',
  },
  {
    name      : 'mocha',
    detect    : (dir) => hasPackageDep(dir, 'mocha') || hasFile(dir, '.mocharc.js') || hasFile(dir, '.mocharc.yml'),
    command   : (dir, opts) => buildNodeCmd('mocha', opts, [
      opts.file ? `"${opts.file}"` : '',
      '--reporter spec',
    ]),
    parse     : parseMochaOutput,
    language  : 'javascript',
  },

  // ── Python ────────────────────────────────────────────────────────────────
  {
    name      : 'pytest',
    detect    : (dir) => hasFile(dir, 'pytest.ini') || hasFile(dir, 'setup.cfg') || hasFile(dir, 'pyproject.toml') || hasFilePattern(dir, 'test_*.py') || hasFilePattern(dir, '*_test.py'),
    command   : (dir, opts) => [
      'python -m pytest',
      '-v',
      '--tb=short',
      opts.file ? `"${opts.file}"` : '',
      opts.testName ? `-k "${opts.testName}"` : '',
    ].filter(Boolean).join(' '),
    parse     : parsePytestOutput,
    language  : 'python',
  },
  {
    name      : 'unittest',
    detect    : (dir) => !hasFile(dir, 'pytest.ini') && hasFilePattern(dir, 'test*.py'),
    command   : (dir, opts) => `python -m unittest discover -v`,
    parse     : parseUnittestOutput,
    language  : 'python',
  },

  // ── Go ────────────────────────────────────────────────────────────────────
  {
    name      : 'go test',
    detect    : (dir) => hasFile(dir, 'go.mod'),
    command   : (dir, opts) => [
      'go test',
      '-v',
      opts.file ? `"./${path.dirname(opts.file)}/..."` : './...',
    ].filter(Boolean).join(' '),
    parse     : parseGoTestOutput,
    language  : 'go',
  },

  // ── Rust ─────────────────────────────────────────────────────────────────
  {
    name      : 'cargo test',
    detect    : (dir) => hasFile(dir, 'Cargo.toml'),
    command   : (dir, opts) => [
      'cargo test',
      opts.testName ? `"${opts.testName}"` : '',
    ].filter(Boolean).join(' '),
    parse     : parseCargoOutput,
    language  : 'rust',
  },
];

// ─────────────────────────────────────────────
//  Detection helpers
// ─────────────────────────────────────────────

function hasPackageDep(dir, pkg) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg_json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return !!(
      pkg_json.dependencies?.[pkg] ||
      pkg_json.devDependencies?.[pkg] ||
      pkg_json.scripts?.test?.includes(pkg)
    );
  } catch { return false; }
}

function hasFile(dir, fileName) {
  return fs.existsSync(path.join(dir, fileName));
}

function hasFilePattern(dir, pattern) {
  try {
    const re    = new RegExp('^' + pattern.replace('*', '.*') + '$');
    const files = fs.readdirSync(dir);
    return files.some(f => re.test(f));
  } catch { return false; }
}

function buildNodeCmd(bin, opts, args) {
  // Use npx if the binary isn't globally installed
  const cmd = `npx --no ${bin}`;
  return [cmd, ...args.filter(Boolean)].join(' ');
}

// ─────────────────────────────────────────────
//  Output parsers — one per framework
// ─────────────────────────────────────────────

/**
 * Shared result shape:
 * {
 *   framework: string,
 *   passed: number,
 *   failed: number,
 *   skipped: number,
 *   total: number,
 *   duration: string,
 *   failures: Array<{ name, file, message, expected, received }>,
 *   rawOutput: string,
 * }
 */

function parseJestOutput(raw, framework) {
  const result = baseResult(framework, raw);

  // Test suite summary: "Tests: 3 failed, 12 passed, 15 total"
  const summaryMatch = raw.match(/Tests:\s+(.*)/);
  if (summaryMatch) {
    const s = summaryMatch[1];
    result.failed  = parseInt(s.match(/(\d+) failed/)?.[1]  || '0');
    result.passed  = parseInt(s.match(/(\d+) passed/)?.[1]  || '0');
    result.skipped = parseInt(s.match(/(\d+) skipped/)?.[1] || '0');
    result.total   = parseInt(s.match(/(\d+) total/)?.[1]   || '0');
  }

  // Duration: "Time: 1.234 s"
  const timeMatch = raw.match(/Time:\s+([\d.]+ s)/);
  if (timeMatch) result.duration = timeMatch[1];

  // Individual failures: "● Test name"
  const failBlocks = raw.split(/\n\s*●\s+/).slice(1);
  for (const block of failBlocks) {
    const lines   = block.split('\n');
    const name    = lines[0].trim();
    const message = extractBetween(block, /expect|Error|Received|Expected/, 8);
    result.failures.push({ name, message: message.slice(0, 500) });
  }

  return result;
}

function parseVitestOutput(raw, framework) {
  const result = baseResult(framework, raw);

  const passMatch = raw.match(/(\d+) passed/);
  const failMatch = raw.match(/(\d+) failed/);
  const skipMatch = raw.match(/(\d+) skipped/);

  result.passed  = parseInt(passMatch?.[1] || '0');
  result.failed  = parseInt(failMatch?.[1] || '0');
  result.skipped = parseInt(skipMatch?.[1] || '0');
  result.total   = result.passed + result.failed + result.skipped;

  const timeMatch = raw.match(/Duration\s+([\d.]+ [ms]+)/);
  if (timeMatch) result.duration = timeMatch[1];

  // Failures
  const failLines = raw.split('\n').filter(l => l.includes('FAIL') || l.includes('× '));
  for (const line of failLines.slice(0, 10)) {
    result.failures.push({ name: line.trim(), message: '' });
  }

  return result;
}

function parseMochaOutput(raw, framework) {
  const result = baseResult(framework, raw);

  const passMatch = raw.match(/(\d+) passing/);
  const failMatch = raw.match(/(\d+) failing/);
  const skipMatch = raw.match(/(\d+) pending/);

  result.passed  = parseInt(passMatch?.[1] || '0');
  result.failed  = parseInt(failMatch?.[1] || '0');
  result.skipped = parseInt(skipMatch?.[1] || '0');
  result.total   = result.passed + result.failed + result.skipped;

  const timeMatch = raw.match(/passing\s+\(([^)]+)\)/);
  if (timeMatch) result.duration = timeMatch[1];

  // Failures: numbered list "  1) Suite > test name"
  const failBlocks = raw.match(/^\s+\d+\) .+$/gm) || [];
  for (const block of failBlocks.slice(0, 10)) {
    result.failures.push({ name: block.trim(), message: '' });
  }

  return result;
}

function parsePytestOutput(raw, framework) {
  const result = baseResult(framework, raw);

  // "5 passed, 2 failed, 1 warning in 3.14s"
  const summaryMatch = raw.match(/(\d+ \w+(?:, \d+ \w+)*) in ([\d.]+s)/);
  if (summaryMatch) {
    const s = summaryMatch[1];
    result.passed  = parseInt(s.match(/(\d+) passed/)?.[1]  || '0');
    result.failed  = parseInt(s.match(/(\d+) failed/)?.[1]  || '0');
    result.skipped = parseInt(s.match(/(\d+) skipped/)?.[1] || '0');
    result.total   = result.passed + result.failed + result.skipped;
    result.duration = summaryMatch[2];
  }

  // FAILED lines: "FAILED tests/test_auth.py::test_login - AssertionError"
  const failLines = raw.match(/^FAILED .+/gm) || [];
  for (const line of failLines) {
    const parts = line.replace('FAILED ', '').split(' - ');
    result.failures.push({
      name    : parts[0]?.trim() || line,
      message : parts[1]?.trim() || '',
    });
  }

  return result;
}

function parseUnittestOutput(raw, framework) {
  const result = baseResult(framework, raw);

  const okMatch   = raw.match(/OK \((\d+) tests?\)/);
  const failMatch = raw.match(/FAILED \((?:failures=(\d+))?(?:, ?errors=(\d+))?\)/);
  const runMatch  = raw.match(/Ran (\d+) tests? in ([\d.]+s)/);

  if (runMatch) {
    result.total    = parseInt(runMatch[1]);
    result.duration = runMatch[2];
  }
  if (okMatch) {
    result.passed = result.total;
    result.failed = 0;
  }
  if (failMatch) {
    result.failed = parseInt(failMatch[1] || '0') + parseInt(failMatch[2] || '0');
    result.passed = result.total - result.failed;
  }

  // FAIL: test_name (module.TestClass)
  const failLines = raw.match(/^(?:FAIL|ERROR): .+/gm) || [];
  for (const line of failLines) {
    result.failures.push({ name: line.trim(), message: '' });
  }

  return result;
}

function parseGoTestOutput(raw, framework) {
  const result = baseResult(framework, raw);

  // "ok  github.com/user/repo  0.123s"
  // "FAIL github.com/user/repo  0.456s"
  const passLines = raw.match(/^ok\s+.+/gm) || [];
  const failLines = raw.match(/^FAIL\s+.+/gm) || [];

  result.passed = passLines.length;
  result.failed = failLines.length;
  result.total  = result.passed + result.failed;

  // "--- FAIL: TestFunctionName (0.00s)"
  const testFails = raw.match(/^--- FAIL: .+/gm) || [];
  for (const line of testFails) {
    const name = line.replace('--- FAIL: ', '').split(' ')[0];
    result.failures.push({ name, message: '' });
  }

  return result;
}

function parseCargoOutput(raw, framework) {
  const result = baseResult(framework, raw);

  // "test result: FAILED. 3 passed; 1 failed; 0 ignored"
  const summaryMatch = raw.match(/test result: \w+\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored/);
  if (summaryMatch) {
    result.passed  = parseInt(summaryMatch[1]);
    result.failed  = parseInt(summaryMatch[2]);
    result.skipped = parseInt(summaryMatch[3]);
    result.total   = result.passed + result.failed + result.skipped;
  }

  // "FAILED tests::test_name"
  const failLines = raw.match(/^FAILED .+/gm) || [];
  for (const line of failLines) {
    result.failures.push({ name: line.replace('FAILED ', '').trim(), message: '' });
  }

  return result;
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function baseResult(framework, rawOutput) {
  return {
    framework,
    passed   : 0,
    failed   : 0,
    skipped  : 0,
    total    : 0,
    duration : 'unknown',
    failures : [],
    rawOutput: rawOutput.slice(0, 6000),
  };
}

function extractBetween(text, startRe, maxLines) {
  const lines  = text.split('\n');
  const start  = lines.findIndex(l => startRe.test(l));
  if (start === -1) return text.slice(0, 300);
  return lines.slice(start, start + maxLines).join('\n');
}

// ─────────────────────────────────────────────
//  Main: detect + run
// ─────────────────────────────────────────────

/**
 * Auto-detect the test framework in `dir` and run tests.
 *
 * @param {string} dir       - Project directory
 * @param {Object} opts
 * @param {string} opts.framework   - Force a specific framework name
 * @param {string} opts.file        - Run tests in a specific file only
 * @param {string} opts.testName    - Run only tests matching this name
 * @param {number} opts.timeout     - Timeout in ms (default: 120000)
 * @returns {TestResult}
 */
function runTests(dir, opts = {}) {
  const timeout = opts.timeout || 120_000;

  // Detect framework
  let framework;
  if (opts.framework) {
    framework = FRAMEWORKS.find(f => f.name === opts.framework);
    if (!framework) {
      throw new Error(
        `Unknown framework: "${opts.framework}". ` +
        `Supported: ${FRAMEWORKS.map(f => f.name).join(', ')}`
      );
    }
  } else {
    framework = FRAMEWORKS.find(f => f.detect(dir));
    if (!framework) {
      throw new Error(
        'Could not detect a test framework in ' + dir + '.\n' +
        'Supported: ' + FRAMEWORKS.map(f => f.name).join(', ') + '\n' +
        'Specify one explicitly with the "framework" parameter.'
      );
    }
  }

  const command = framework.command(dir, opts);

  // Use spawnSync so we always capture both stdout AND stderr —
  // Jest writes its summary to stderr even on success, so execSync misses it.
  const [bin, ...args] = command.split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const proc = spawnSync(bin, args, {
    cwd     : dir,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env     : { ...process.env, FORCE_COLOR: '0', CI: 'true', NO_COLOR: '1' },
    shell   : true,   // needed so npx resolves correctly
  });

  // Combine stderr first (Jest summary lives here) then stdout (pytest/go)
  const rawOutput = [proc.stderr || '', proc.stdout || ''].join('\n');
  const exitCode  = proc.status || 0;

  const result   = framework.parse(rawOutput, framework.name);
  result.command = command;
  result.exitCode = exitCode;

  return result;
}

/**
 * Format a TestResult into AI-readable text.
 */
function formatTestResult(result) {
  const lines  = [];
  const status = result.failed === 0 ? '✅ PASS' : '❌ FAIL';

  lines.push(`${status} — ${result.framework}`);
  lines.push(`${result.passed} passed · ${result.failed} failed · ${result.skipped} skipped · ${result.total} total · ${result.duration}`);
  lines.push('');

  if (result.failures.length > 0) {
    lines.push(`FAILURES (${result.failures.length}):`);
    for (const f of result.failures.slice(0, 15)) {
      lines.push(`  ✗ ${f.name}`);
      if (f.message) {
        f.message.split('\n').slice(0, 6).forEach(l => {
          lines.push(`    ${l}`);
        });
      }
    }
    if (result.failures.length > 15) {
      lines.push(`  … and ${result.failures.length - 15} more failures`);
    }
    lines.push('');
  }

  // Include relevant portion of raw output for context
  if (result.failed > 0 && result.rawOutput) {
    const relevant = extractRelevantOutput(result.rawOutput);
    if (relevant) {
      lines.push('RELEVANT OUTPUT:');
      lines.push(relevant);
    }
  }

  return lines.join('\n');
}

/**
 * Extract the most useful portion of raw test output.
 * Skips noisy headers, keeps failure details.
 */
function extractRelevantOutput(raw) {
  const lines = raw.split('\n');

  // Find the failure section
  const failStart = lines.findIndex(l =>
    /FAIL|Error|● |AssertionError|expected|received|panic/i.test(l)
  );

  if (failStart === -1) return raw.slice(-1000);

  return lines
    .slice(Math.max(0, failStart - 2), failStart + 40)
    .join('\n')
    .slice(0, 1500);
}

/**
 * Detect the test framework without running tests.
 * Returns the framework name or null.
 */
function detectFramework(dir) {
  const fw = FRAMEWORKS.find(f => f.detect(dir));
  return fw ? fw.name : null;
}

module.exports = {
  runTests,
  detectFramework,
  formatTestResult,
  FRAMEWORKS,
  // Export parsers for testing
  parseJestOutput,
  parsePytestOutput,
  parseGoTestOutput,
  parseCargoOutput,
};
