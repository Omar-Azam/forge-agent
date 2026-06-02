// tests/searcher.test.js — Day 12: Multi-file semantic search tests
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
  searchCodebase,
  formatSearchResult,
  extractSymbols,
  fuzzyMatch,
  scoreMatch,
  walkFiles,
} = require('../src/searcher');

// ─────────────────────────────────────────────
//  Test fixture — a small fake codebase
// ─────────────────────────────────────────────

const REPO = path.join(os.tmpdir(), 'dsa-search-test-' + Date.now());

function write(rel, content) {
  const abs = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

beforeAll(() => {
  fs.mkdirSync(REPO, { recursive: true });

  write('src/auth/login.js', `
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

async function loginUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user) throw new Error('User not found');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
}

async function logoutUser(userId) {
  await invalidateToken(userId);
}

module.exports = { loginUser, logoutUser };
`);

  write('src/auth/register.js', `
async function registerUser(email, password, name) {
  const existing = await findUserByEmail(email);
  if (existing) throw new Error('Email already registered');
  const hash = await bcrypt.hash(password, 10);
  return createUser({ email, password: hash, name });
}

class UserValidator {
  static validate(data) {
    if (!data.email) throw new Error('Email required');
    if (!data.password || data.password.length < 8) throw new Error('Weak password');
  }
}

module.exports = { registerUser, UserValidator };
`);

  write('src/api/users.js', `
const express = require('express');
const router  = express.Router();

router.get('/users', async (req, res) => {
  const users = await getAllUsers();
  res.json(users);
});

router.get('/users/:id', async (req, res) => {
  const user = await getUserById(req.params.id);
  res.json(user);
});

router.delete('/users/:id', async (req, res) => {
  await deleteUser(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
`);

  write('src/utils/email.js', `
async function sendWelcomeEmail(user) {
  return sendEmail({
    to     : user.email,
    subject: 'Welcome to our platform!',
    body   : \`Hello \${user.name}, thanks for signing up.\`,
  });
}

async function sendPasswordResetEmail(email, token) {
  return sendEmail({ to: email, subject: 'Reset your password', body: token });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { sendWelcomeEmail, sendPasswordResetEmail, EMAIL_REGEX };
`);

  write('src/db/connection.js', `
const { Pool } = require('pg');

class DatabaseConnection {
  constructor(config) {
    this.pool = new Pool(config);
  }

  async query(sql, params) {
    return this.pool.query(sql, params);
  }

  async close() {
    return this.pool.end();
  }
}

let instance = null;

function getDatabase() {
  if (!instance) instance = new DatabaseConnection(process.env.DB_CONFIG);
  return instance;
}

module.exports = { DatabaseConnection, getDatabase };
`);

  write('README.md', `
# My API Project

A REST API built with Express and PostgreSQL.

## Setup

Run \`npm install\` then \`npm start\`.

## Authentication

Uses JWT for authentication. See src/auth/ for details.
`);

  write('package.json', JSON.stringify({
    name        : 'my-api',
    version     : '1.0.0',
    dependencies: { express: '^4.18.0', bcrypt: '^5.1.0', jsonwebtoken: '^9.0.0', pg: '^8.11.0' },
  }, null, 2));

  // These should be ignored
  write('node_modules/express/index.js', 'module.exports = function express() {};');
  write('.git/config', '[core]\n\trepositoryformatversion = 0');
});

afterAll(() => {
  fs.rmSync(REPO, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
//  fuzzyMatch
// ─────────────────────────────────────────────

describe('fuzzyMatch', () => {
  test('exact substring match', () => {
    expect(fuzzyMatch('login', 'loginUser')).toBe(true);
    expect(fuzzyMatch('User', 'loginUser')).toBe(true);
  });

  test('case-insensitive match', () => {
    expect(fuzzyMatch('LOGIN', 'loginUser')).toBe(true);
    expect(fuzzyMatch('loginuser', 'loginUser')).toBe(true);
  });

  test('camelCase decomposition', () => {
    expect(fuzzyMatch('get user', 'getUserById')).toBe(false); // spaces in query don't decompose
    expect(fuzzyMatch('getuser', 'getUserById')).toBe(true);
  });

  test('subsequence match for 3+ char queries', () => {
    expect(fuzzyMatch('gub', 'getUserById')).toBe(true);  // g-u-b subsequence
    expect(fuzzyMatch('dbc', 'DatabaseConnection')).toBe(true);
  });

  test('acronym match for longer queries', () => {
    // 'dbc' matches DatabaseConnection as a subsequence (d-b-c appears in order)
    expect(fuzzyMatch('dbc', 'DatabaseConnection')).toBe(true);
    // 'usr' matches UserValidator as a subsequence
    expect(fuzzyMatch('usr', 'UserValidator')).toBe(true);
  });

  test('no match for unrelated strings', () => {
    expect(fuzzyMatch('xyz', 'loginUser')).toBe(false);
    expect(fuzzyMatch('payment', 'loginUser')).toBe(false);
  });

  test('short queries (< 3 chars) only do substring match', () => {
    expect(fuzzyMatch('us', 'loginUser')).toBe(true);  // substring
    expect(fuzzyMatch('xy', 'loginUser')).toBe(false);
  });
});

// ─────────────────────────────────────────────
//  extractSymbols
// ─────────────────────────────────────────────

describe('extractSymbols', () => {
  test('extracts JS functions', () => {
    const code    = 'async function loginUser(email, password) { return true; }';
    const symbols = extractSymbols(code, 'auth.js');
    const names   = symbols.map(s => s.name);
    expect(names).toContain('loginUser');
  });

  test('extracts JS classes', () => {
    const code    = 'class UserValidator { static validate(data) {} }';
    const symbols = extractSymbols(code, 'validator.js');
    const classes = symbols.filter(s => s.kind === 'class');
    expect(classes.map(s => s.name)).toContain('UserValidator');
  });

  test('extracts arrow function assignments', () => {
    const code    = 'const handleRequest = async (req, res) => { return res.json({}); }';
    const symbols = extractSymbols(code, 'handler.js');
    const names   = symbols.map(s => s.name);
    expect(names).toContain('handleRequest');
  });

  test('extracts Python functions', () => {
    const code    = 'def calculate_total(items):\n    return sum(items)';
    const symbols = extractSymbols(code, 'calc.py');
    expect(symbols.map(s => s.name)).toContain('calculate_total');
  });

  test('extracts Python classes', () => {
    const code    = 'class PaymentProcessor:\n    def process(self): pass';
    const symbols = extractSymbols(code, 'payment.py');
    const classes = symbols.filter(s => s.kind === 'class');
    expect(classes.map(s => s.name)).toContain('PaymentProcessor');
  });

  test('returns line numbers', () => {
    const code = 'const x = 1;\nconst y = 2;\nfunction myFunc() {}';
    const syms = extractSymbols(code, 'test.js');
    const fn   = syms.find(s => s.name === 'myFunc');
    expect(fn).toBeDefined();
    // myFunc is on line 3
    expect(fn.line).toBe(3);
  });

  test('deduplicates repeated symbols', () => {
    const code = 'function foo() {}\nfunction foo() {}';
    const syms = extractSymbols(code, 'dupe.js');
    const foos = syms.filter(s => s.name === 'foo');
    expect(foos).toHaveLength(1);
  });

  test('skips noise keywords', () => {
    const code = 'if (true) { for (let i=0; i<10; i++) {} }';
    const syms = extractSymbols(code, 'code.js');
    const names = syms.map(s => s.name);
    expect(names).not.toContain('if');
    expect(names).not.toContain('for');
  });
});

// ─────────────────────────────────────────────
//  walkFiles
// ─────────────────────────────────────────────

describe('walkFiles', () => {
  test('finds files recursively', () => {
    const files = walkFiles(REPO);
    const rels  = files.map(f => path.relative(REPO, f));
    expect(rels).toContain(path.join('src', 'auth', 'login.js'));
    expect(rels).toContain(path.join('src', 'utils', 'email.js'));
  });

  test('excludes node_modules', () => {
    const files = walkFiles(REPO);
    expect(files.some(f => f.includes('node_modules'))).toBe(false);
  });

  test('excludes .git directory', () => {
    const files = walkFiles(REPO);
    expect(files.some(f => f.includes('.git'))).toBe(false);
  });

  test('returns absolute paths', () => {
    const files = walkFiles(REPO);
    files.forEach(f => expect(path.isAbsolute(f)).toBe(true));
  });
});

// ─────────────────────────────────────────────
//  searchCodebase — symbol search
// ─────────────────────────────────────────────

describe('searchCodebase — symbol search', () => {
  test('finds a function by exact name', () => {
    const result = searchCodebase('loginUser', REPO, { type: 'symbol' });
    expect(result.results.length).toBeGreaterThan(0);
    const match = result.results.find(r => r.name === 'loginUser');
    expect(match).toBeDefined();
    expect(match.symKind).toBe('function');
  });

  test('finds a class by name', () => {
    const result = searchCodebase('UserValidator', REPO, { type: 'symbol' });
    const match  = result.results.find(r => r.name === 'UserValidator');
    expect(match).toBeDefined();
    expect(match.symKind).toBe('class');
  });

  test('finds symbols across multiple files', () => {
    const result = searchCodebase('User', REPO, { type: 'symbol' });
    const files  = new Set(result.results.map(r => r.file));
    expect(files.size).toBeGreaterThan(1);
  });

  test('fuzzy matches partial names', () => {
    // "logUser" should fuzzy-match "loginUser" and "logoutUser"
    const result = searchCodebase('logUser', REPO, { type: 'symbol', fuzzy: true });
    const names  = result.results.map(r => r.name);
    expect(names.some(n => n.includes('log'))).toBe(true);
  });

  test('respects fuzzy:false for exact matching only', () => {
    const result = searchCodebase('logUser', REPO, { type: 'symbol', fuzzy: false });
    const names  = result.results.map(r => r.name);
    // "logUser" should not match "loginUser" without fuzzy
    expect(names).not.toContain('loginUser');
  });
});

// ─────────────────────────────────────────────
//  searchCodebase — text search
// ─────────────────────────────────────────────

describe('searchCodebase — text search', () => {
  test('finds exact text matches', () => {
    const result = searchCodebase('JWT_SECRET', REPO, { type: 'text' });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].file).toContain('login.js');
  });

  test('is case-insensitive', () => {
    const result = searchCodebase('jwt_secret', REPO, { type: 'text' });
    expect(result.results.length).toBeGreaterThan(0);
  });

  test('finds text across multiple files', () => {
    const result = searchCodebase('email', REPO, { type: 'text' });
    const files  = new Set(result.results.map(r => r.file));
    expect(files.size).toBeGreaterThan(1);
  });

  test('returns line numbers for matches', () => {
    const result = searchCodebase('bcrypt', REPO, { type: 'text' });
    result.results.forEach(r => {
      expect(typeof r.line).toBe('number');
      expect(r.line).toBeGreaterThan(0);
    });
  });

  test('includes preview of matching line', () => {
    const result = searchCodebase('JWT_SECRET', REPO, { type: 'text' });
    expect(result.results[0].preview).toContain('JWT_SECRET');
  });
});

// ─────────────────────────────────────────────
//  searchCodebase — file search
// ─────────────────────────────────────────────

describe('searchCodebase — file search', () => {
  test('finds files by name', () => {
    const result = searchCodebase('login', REPO, { type: 'file' });
    expect(result.results.some(r => r.file.includes('login.js'))).toBe(true);
  });

  test('finds files by fuzzy name', () => {
    const result = searchCodebase('conn', REPO, { type: 'file', fuzzy: true });
    expect(result.results.some(r => r.file.includes('connection.js'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  searchCodebase — auto mode
// ─────────────────────────────────────────────

describe('searchCodebase — auto mode', () => {
  test('finds symbols AND text matches together', () => {
    const result = searchCodebase('DatabaseConnection', REPO, { type: 'auto' });
    expect(result.results.length).toBeGreaterThan(0);
    // Should find both the class definition (symbol) and usages (text)
    const kinds = new Set(result.results.map(r => r.kind));
    expect(kinds.has('symbol')).toBe(true);
  });

  test('limits results to specified count', () => {
    const result = searchCodebase('user', REPO, { type: 'auto', limit: 5 });
    expect(result.results.length).toBeLessThanOrEqual(5);
  });

  test('higher-relevance results appear first', () => {
    const result = searchCodebase('loginUser', REPO, { type: 'auto' });
    expect(result.results.length).toBeGreaterThan(0);
    // Exact function name match should be first or near first
    const topResult = result.results[0];
    expect(topResult.name || topResult.preview).toMatch(/login|Login/i);
  });
});

// ─────────────────────────────────────────────
//  searchCodebase — extension filter
// ─────────────────────────────────────────────

describe('searchCodebase — extension filter', () => {
  test('limits search to specified extension', () => {
    const result = searchCodebase('email', REPO, { ext: '.js' });
    result.results.forEach(r => {
      expect(r.file.endsWith('.js')).toBe(true);
    });
  });

  test('returns no results for non-existent extension', () => {
    const result = searchCodebase('function', REPO, { ext: '.py' });
    // Our test files are all .js — no .py files
    expect(result.results.length).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  searchCodebase — edge cases
// ─────────────────────────────────────────────

describe('searchCodebase — edge cases', () => {
  test('returns empty results for no match', () => {
    const result = searchCodebase('xyzzy_no_match_12345', REPO);
    expect(result.results).toHaveLength(0);
    expect(result.totalMatches).toBe(0);
  });

  test('reports files searched count', () => {
    const result = searchCodebase('anything', REPO);
    expect(result.filesSearched).toBeGreaterThan(0);
  });

  test('throws on empty query', () => {
    expect(() => searchCodebase('', REPO)).toThrow(/empty/i);
  });
});

// ─────────────────────────────────────────────
//  formatSearchResult
// ─────────────────────────────────────────────

describe('formatSearchResult', () => {
  test('returns a string', () => {
    const result = searchCodebase('loginUser', REPO);
    const fmt    = formatSearchResult(result);
    expect(typeof fmt).toBe('string');
    expect(fmt.length).toBeGreaterThan(0);
  });

  test('includes query in output', () => {
    const result = searchCodebase('loginUser', REPO);
    const fmt    = formatSearchResult(result);
    expect(fmt).toContain('loginUser');
  });

  test('groups results by file', () => {
    const result = searchCodebase('email', REPO);
    const fmt    = formatSearchResult(result);
    // File headers use ── filename ── format
    expect(fmt).toMatch(/──.*\.js/);
  });

  test('shows helpful message when no results', () => {
    const result = searchCodebase('xyzzy_no_match', REPO);
    const fmt    = formatSearchResult(result);
    expect(fmt).toMatch(/no results/i);
    expect(fmt).toMatch(/suggestions/i);
  });

  test('shows match count in header', () => {
    const result = searchCodebase('user', REPO);
    const fmt    = formatSearchResult(result);
    expect(fmt).toMatch(/found \d+ match/i);
  });
});

// ─────────────────────────────────────────────
//  Tool integration
// ─────────────────────────────────────────────

describe('search_codebase tool integration', () => {
  const mockConfig = {
    WORKING_DIR      : REPO,
    MAX_OUTPUT_LENGTH: 8000,
    STRICT_SANDBOX   : false,
    DEBUG            : false,
    SESSION_DIR      : os.tmpdir(),
  };

  jest.mock('../src/config', () => mockConfig, { virtual: false });

  test('tool is registered with 22 total tools', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('search_codebase');
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(22);
  });

  test('tool description mentions fuzzy and ranking', () => {
    const { TOOLS } = require('../src/tools');
    const desc = TOOLS.search_codebase.description;
    expect(desc.toLowerCase()).toMatch(/fuzzy|relevance|rank/i);
  });
});
