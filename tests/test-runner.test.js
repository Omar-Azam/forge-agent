// tests/test-runner.test.js — Day 13: Test runner tests
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
  runTests,
  detectFramework,
  formatTestResult,
  FRAMEWORKS,
  parseJestOutput,
  parsePytestOutput,
  parseGoTestOutput,
  parseCargoOutput,
} = require('../src/test-runner');

// ─────────────────────────────────────────────
//  Sample raw output fixtures
// ─────────────────────────────────────────────

const JEST_PASS = `
PASS tests/auth.test.js
PASS tests/utils.test.js

Tests:       45 passed, 45 total
Test Suites: 2 passed, 2 total
Snapshots:   0 total
Time:        2.341 s
Ran all test suites.
`;

const JEST_FAIL = `
FAIL tests/auth.test.js

  ● loginUser › should return JWT token

    expect(received).toBeDefined()

    Received: undefined

      14 |   it('should return JWT token', async () => {
      15 |     const token = await loginUser('test@test.com', 'password');
    > 16 |     expect(token).toBeDefined();
         |                   ^
      17 |   });

Tests:       2 failed, 8 passed, 10 total
Test Suites: 1 failed, 1 passed, 2 total
Time:        1.234 s
`;

const PYTEST_PASS = `
collected 12 items

tests/test_auth.py::test_login PASSED
tests/test_auth.py::test_register PASSED
tests/test_utils.py::test_email PASSED

============ 12 passed in 1.23s ============
`;

const PYTEST_FAIL = `
collected 5 items

tests/test_auth.py::test_login PASSED
tests/test_auth.py::test_register FAILED
tests/test_auth.py::test_logout FAILED

FAILED tests/test_auth.py::test_register - AssertionError: Expected 201, got 400
FAILED tests/test_auth.py::test_logout - AttributeError: 'NoneType' has no attribute 'token'

============ 2 failed, 3 passed in 2.34s ============
`;

const GO_PASS = `
=== RUN   TestLogin
--- PASS: TestLogin (0.00s)
=== RUN   TestRegister
--- PASS: TestRegister (0.01s)
ok  github.com/user/myapp  0.123s
`;

const GO_FAIL = `
=== RUN   TestLogin
--- PASS: TestLogin (0.00s)
=== RUN   TestGetUser
    auth_test.go:42: expected 200, got 404
--- FAIL: TestGetUser (0.01s)
FAIL github.com/user/myapp  0.456s
`;

const CARGO_PASS = `
running 5 tests
test tests::test_add ... ok
test tests::test_sub ... ok
test tests::test_mul ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured
`;

const CARGO_FAIL = `
running 3 tests
test tests::test_add ... ok
test tests::test_div ... FAILED

failures:
    tests::test_div

test result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured
FAILED tests::test_div
`;

// ─────────────────────────────────────────────
//  FRAMEWORKS list
// ─────────────────────────────────────────────

describe('FRAMEWORKS registry', () => {
  test('contains all expected frameworks', () => {
    const names = FRAMEWORKS.map(f => f.name);
    expect(names).toContain('jest');
    expect(names).toContain('vitest');
    expect(names).toContain('mocha');
    expect(names).toContain('pytest');
    expect(names).toContain('go test');
    expect(names).toContain('cargo test');
  });

  test('every framework has detect, command, and parse', () => {
    FRAMEWORKS.forEach(fw => {
      expect(typeof fw.detect).toBe('function');
      expect(typeof fw.command).toBe('function');
      expect(typeof fw.parse).toBe('function');
      expect(typeof fw.name).toBe('string');
    });
  });
});

// ─────────────────────────────────────────────
//  parseJestOutput
// ─────────────────────────────────────────────

describe('parseJestOutput — passing', () => {
  let result;
  beforeAll(() => { result = parseJestOutput(JEST_PASS, 'jest'); });

  test('parsed framework name', () => expect(result.framework).toBe('jest'));
  test('passed count', ()       => expect(result.passed).toBe(45));
  test('failed count', ()       => expect(result.failed).toBe(0));
  test('total count', ()        => expect(result.total).toBe(45));
  test('duration parsed', ()    => expect(result.duration).toMatch(/\d+\.\d+ s/));
  test('no failures', ()        => expect(result.failures).toHaveLength(0));
});

describe('parseJestOutput — failing', () => {
  let result;
  beforeAll(() => { result = parseJestOutput(JEST_FAIL, 'jest'); });

  test('failed count', ()           => expect(result.failed).toBe(2));
  test('passed count', ()           => expect(result.passed).toBe(8));
  test('total count', ()            => expect(result.total).toBe(10));
  test('failure list populated', () => expect(result.failures.length).toBeGreaterThan(0));
  test('failure has name', ()       => expect(result.failures[0].name).toBeTruthy());
  test('failure has message', ()    => expect(result.failures[0].message).toBeTruthy());
});

// ─────────────────────────────────────────────
//  parsePytestOutput
// ─────────────────────────────────────────────

describe('parsePytestOutput — passing', () => {
  let result;
  beforeAll(() => { result = parsePytestOutput(PYTEST_PASS, 'pytest'); });

  test('passed count', ()    => expect(result.passed).toBe(12));
  test('failed count', ()    => expect(result.failed).toBe(0));
  test('duration parsed', () => expect(result.duration).toMatch(/\d+\.\d+s/));
  test('no failures', ()     => expect(result.failures).toHaveLength(0));
});

describe('parsePytestOutput — failing', () => {
  let result;
  beforeAll(() => { result = parsePytestOutput(PYTEST_FAIL, 'pytest'); });

  test('failed count', ()         => expect(result.failed).toBe(2));
  test('passed count', ()         => expect(result.passed).toBe(3));
  test('failures populated', ()   => expect(result.failures).toHaveLength(2));
  test('failure has name', ()     => expect(result.failures[0].name).toContain('test_register'));
  test('failure has message', ()  => expect(result.failures[0].message).toContain('AssertionError'));
});

// ─────────────────────────────────────────────
//  parseGoTestOutput
// ─────────────────────────────────────────────

describe('parseGoTestOutput — passing', () => {
  let result;
  beforeAll(() => { result = parseGoTestOutput(GO_PASS, 'go test'); });

  test('passed count', ()    => expect(result.passed).toBe(1));
  test('failed count', ()    => expect(result.failed).toBe(0));
  test('no failures', ()     => expect(result.failures).toHaveLength(0));
});

describe('parseGoTestOutput — failing', () => {
  let result;
  beforeAll(() => { result = parseGoTestOutput(GO_FAIL, 'go test'); });

  test('failed count', ()       => expect(result.failed).toBe(1));
  test('failures populated', () => expect(result.failures).toHaveLength(1));
  test('failure name', ()       => expect(result.failures[0].name).toBe('TestGetUser'));
});

// ─────────────────────────────────────────────
//  parseCargoOutput
// ─────────────────────────────────────────────

describe('parseCargoOutput — passing', () => {
  let result;
  beforeAll(() => { result = parseCargoOutput(CARGO_PASS, 'cargo test'); });

  test('passed count', ()  => expect(result.passed).toBe(5));
  test('failed count', ()  => expect(result.failed).toBe(0));
  test('no failures', ()   => expect(result.failures).toHaveLength(0));
});

describe('parseCargoOutput — failing', () => {
  let result;
  beforeAll(() => { result = parseCargoOutput(CARGO_FAIL, 'cargo test'); });

  test('failed count', ()       => expect(result.failed).toBe(1));
  test('passed count', ()       => expect(result.passed).toBe(2));
  test('failures populated', () => expect(result.failures).toHaveLength(1));
  test('failure name', ()       => expect(result.failures[0].name).toContain('test_div'));
});

// ─────────────────────────────────────────────
//  detectFramework
// ─────────────────────────────────────────────

describe('detectFramework', () => {
  const TMP = path.join(os.tmpdir(), 'dsa-fw-detect-' + Date.now());
  beforeAll(() => fs.mkdirSync(TMP, { recursive: true }));
  afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

  function write(rel, content) {
    const abs = path.join(TMP, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }

  test('detects jest from package.json devDependencies', () => {
    write('jest/package.json', JSON.stringify({
      devDependencies: { jest: '^29.0.0' },
    }));
    expect(detectFramework(path.join(TMP, 'jest'))).toBe('jest');
  });

  test('detects jest from jest.config.js file', () => {
    const dir = path.join(TMP, 'jest-config');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'jest.config.js'), 'module.exports = {};');
    expect(detectFramework(dir)).toBe('jest');
  });

  test('detects vitest from package.json', () => {
    write('vitest/package.json', JSON.stringify({
      devDependencies: { vitest: '^1.0.0' },
    }));
    expect(detectFramework(path.join(TMP, 'vitest'))).toBe('vitest');
  });

  test('detects go test from go.mod', () => {
    write('goproject/go.mod', 'module github.com/user/myapp\n\ngo 1.21');
    expect(detectFramework(path.join(TMP, 'goproject'))).toBe('go test');
  });

  test('detects cargo test from Cargo.toml', () => {
    write('rustproject/Cargo.toml', '[package]\nname = "myapp"\nversion = "0.1.0"');
    expect(detectFramework(path.join(TMP, 'rustproject'))).toBe('cargo test');
  });

  test('returns null when no framework found', () => {
    const empty = path.join(TMP, 'empty-project');
    fs.mkdirSync(empty, { recursive: true });
    expect(detectFramework(empty)).toBeNull();
  });

  test('detects pytest from pytest.ini', () => {
    write('pytest/pytest.ini', '[pytest]\ntestpaths = tests');
    expect(detectFramework(path.join(TMP, 'pytest'))).toBe('pytest');
  });
});

// ─────────────────────────────────────────────
//  formatTestResult
// ─────────────────────────────────────────────

describe('formatTestResult', () => {
  test('shows PASS for zero failures', () => {
    const result = parseJestOutput(JEST_PASS, 'jest');
    const fmt    = formatTestResult(result);
    expect(fmt).toContain('✅ PASS');
    expect(fmt).toContain('jest');
  });

  test('shows FAIL for non-zero failures', () => {
    const result = parseJestOutput(JEST_FAIL, 'jest');
    const fmt    = formatTestResult(result);
    expect(fmt).toContain('❌ FAIL');
  });

  test('includes counts in summary line', () => {
    const result = parseJestOutput(JEST_FAIL, 'jest');
    const fmt    = formatTestResult(result);
    expect(fmt).toContain('2 failed');
    expect(fmt).toContain('8 passed');
  });

  test('lists failure names', () => {
    const result = parseJestOutput(JEST_FAIL, 'jest');
    const fmt    = formatTestResult(result);
    expect(fmt).toContain('loginUser');
  });

  test('includes FAILURES section when tests fail', () => {
    const result = parsePytestOutput(PYTEST_FAIL, 'pytest');
    const fmt    = formatTestResult(result);
    expect(fmt).toContain('FAILURES');
  });

  test('includes relevant output snippet on failure', () => {
    const result = parseJestOutput(JEST_FAIL, 'jest');
    const fmt    = formatTestResult(result);
    // Should include some portion of the raw failure output
    expect(fmt).toMatch(/expect|Error|RELEVANT/i);
  });

  test('returns a string', () => {
    const result = parseJestOutput(JEST_PASS, 'jest');
    expect(typeof formatTestResult(result)).toBe('string');
  });
});

// ─────────────────────────────────────────────
//  runTests — live execution
// ─────────────────────────────────────────────

describe('runTests — live Jest execution', () => {
  const AGENT_ROOT = path.join(__dirname, '..');

  test('detects jest in the agent project', () => {
    expect(detectFramework(AGENT_ROOT)).toBe('jest');
  });

  test('runs jest and returns a result object', () => {
    // Run just one small fast test file
    const result = runTests(AGENT_ROOT, {
      framework: 'jest',
      file     : 'tests/parser.test.js',
      timeout  : 60_000,
    });
    expect(typeof result.passed).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(result.framework).toBe('jest');
    expect(result.total).toBeGreaterThan(0);
  }, 70_000);

  test('passes when all tests pass', () => {
    const result = runTests(AGENT_ROOT, {
      framework: 'jest',
      file     : 'tests/parser.test.js',
      timeout  : 60_000,
    });
    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  }, 70_000);

  test('throws on unknown framework', () => {
    expect(() => runTests(AGENT_ROOT, { framework: 'unknownfw' }))
      .toThrow(/unknown framework/i);
  });

  test('throws on directory with no framework', () => {
    const emptyDir = path.join(os.tmpdir(), 'dsa-empty-' + Date.now());
    fs.mkdirSync(emptyDir, { recursive: true });
    expect(() => runTests(emptyDir)).toThrow(/detect/i);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ─────────────────────────────────────────────
//  Tool registration
// ─────────────────────────────────────────────

describe('run_tests tool registration', () => {
  test('tool is registered', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('run_tests');
  });

  test('total tool count is now 23', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(23);
  });

  test('description mentions auto-detection', () => {
    const { TOOLS } = require('../src/tools');
    expect(TOOLS.run_tests.description).toMatch(/auto.detect/i);
  });
});
