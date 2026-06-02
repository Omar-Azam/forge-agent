// tests/env-manager.test.js — Day 16: Environment variable tool tests
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
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
} = require('../src/env-manager');

const TMP = path.join(os.tmpdir(), 'dsa-env-test-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

function tmpFile(name, content) {
  const p = path.join(TMP, name);
  if (content !== undefined) fs.writeFileSync(p, content, 'utf8');
  return p;
}

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const SAMPLE_ENV = [
  '# App config',
  'NODE_ENV=development',
  'PORT=3000',
  'DEBUG=true',
  '',
  '# Database',
  'DATABASE_URL=postgres://localhost:5432/mydb',
  '',
  '# Secrets',
  'JWT_SECRET=supersecretkey1234567890abcdef',
  'API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
  'DB_PASSWORD=MyS3cur3P@ssw0rd!',
].join('\n') + '\n';

// ─────────────────────────────────────────────
//  isSecret
// ─────────────────────────────────────────────

describe('isSecret', () => {
  test('JWT_SECRET is secret', () => {
    expect(isSecret('JWT_SECRET', 'supersecretkey1234567890')).toBe(true);
  });

  test('API_KEY is secret', () => {
    expect(isSecret('API_KEY', 'sk-abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });

  test('DB_PASSWORD is secret', () => {
    expect(isSecret('DB_PASSWORD', 'MyS3cur3P@ssw0rd!')).toBe(true);
  });

  test('TOKEN in key name is secret', () => {
    expect(isSecret('ACCESS_TOKEN', 'ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
  });

  test('PORT is not secret', () => {
    expect(isSecret('PORT', '3000')).toBe(false);
  });

  test('NODE_ENV is not secret', () => {
    expect(isSecret('NODE_ENV', 'development')).toBe(false);
  });

  test('DEBUG=true is not secret', () => {
    expect(isSecret('DEBUG', 'true')).toBe(false);
  });

  test('DATABASE_URL is not secret (URL pattern)', () => {
    expect(isSecret('DATABASE_URL', 'postgres://localhost:5432/mydb')).toBe(false);
  });

  test('empty value is not secret', () => {
    expect(isSecret('SECRET_KEY', '')).toBe(false);
  });

  test('short value is not secret', () => {
    expect(isSecret('SECRET_KEY', 'abc')).toBe(false);
  });

  test('JWT token value is secret regardless of key name', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.abc123def456';
    expect(isSecret('SOME_VAR', jwt)).toBe(true);
  });

  test('long random hex string is secret', () => {
    expect(isSecret('SOME_KEY', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true);
  });
});

// ─────────────────────────────────────────────
//  maskValue
// ─────────────────────────────────────────────

describe('maskValue', () => {
  test('masks long values showing first and last 2 chars', () => {
    const masked = maskValue('supersecret12345678');
    expect(masked.startsWith('su')).toBe(true);
    expect(masked.endsWith('78')).toBe(true);
    expect(masked).toContain('*');
  });

  test('masks short values completely', () => {
    expect(maskValue('abc')).toBe('****');
  });

  test('handles empty string', () => {
    expect(maskValue('')).toBe('');
  });

  test('masked value does not reveal full content', () => {
    const original = 'supersecretkey1234567890abcdef';
    const masked   = maskValue(original);
    expect(masked).not.toBe(original);
    expect(masked.length).toBeLessThan(original.length);
  });
});

// ─────────────────────────────────────────────
//  parseEnvFile
// ─────────────────────────────────────────────

describe('parseEnvFile', () => {
  test('parses variable entries', () => {
    const entries = parseEnvFile('PORT=3000\nNODE_ENV=development\n');
    const vars    = entries.filter(e => e.type === 'var');
    expect(vars).toHaveLength(2);
    expect(vars[0]).toMatchObject({ key: 'PORT', value: '3000' });
    expect(vars[1]).toMatchObject({ key: 'NODE_ENV', value: 'development' });
  });

  test('parses comment lines', () => {
    const entries  = parseEnvFile('# This is a comment\nPORT=3000\n');
    const comments = entries.filter(e => e.type === 'comment');
    expect(comments).toHaveLength(1);
    expect(comments[0].comment).toBe('This is a comment');
  });

  test('parses blank lines', () => {
    const entries = parseEnvFile('A=1\n\nB=2\n');
    const blanks  = entries.filter(e => e.type === 'blank');
    expect(blanks).toHaveLength(1);
  });

  test('strips double quotes from values', () => {
    const entries = parseEnvFile('URL="https://example.com"\n');
    const v       = entries.find(e => e.type === 'var');
    expect(v.value).toBe('https://example.com');
  });

  test('strips single quotes from values', () => {
    const entries = parseEnvFile("NAME='hello world'\n");
    const v       = entries.find(e => e.type === 'var');
    expect(v.value).toBe('hello world');
  });

  test('handles values with equals signs', () => {
    const entries = parseEnvFile('CONN=user:pass@host/db?ssl=true\n');
    const v       = entries.find(e => e.type === 'var');
    expect(v.value).toBe('user:pass@host/db?ssl=true');
  });

  test('parses full sample env file', () => {
    const entries = parseEnvFile(SAMPLE_ENV);
    const vars    = entries.filter(e => e.type === 'var');
    expect(vars.length).toBeGreaterThan(5);
    expect(vars.map(v => v.key)).toContain('JWT_SECRET');
    expect(vars.map(v => v.key)).toContain('PORT');
  });
});

// ─────────────────────────────────────────────
//  serialiseEnvFile roundtrip
// ─────────────────────────────────────────────

describe('serialiseEnvFile', () => {
  test('roundtrips parse → serialise correctly', () => {
    const entries    = parseEnvFile('PORT=3000\nNODE_ENV=development\n');
    const serialised = serialiseEnvFile(entries);
    expect(serialised).toContain('PORT=3000');
    expect(serialised).toContain('NODE_ENV=development');
  });

  test('preserves comments in roundtrip', () => {
    const src        = '# App\nPORT=3000\n';
    const serialised = serialiseEnvFile(parseEnvFile(src));
    expect(serialised).toContain('# App');
    expect(serialised).toContain('PORT=3000');
  });
});

// ─────────────────────────────────────────────
//  readEnvFile
// ─────────────────────────────────────────────

describe('readEnvFile', () => {
  test('returns exists:false for missing file', () => {
    const result = readEnvFile(path.join(TMP, 'nonexistent.env'));
    expect(result.exists).toBe(false);
  });

  test('reads variables correctly', () => {
    const p      = tmpFile('read-test.env', SAMPLE_ENV);
    const result = readEnvFile(p);
    expect(result.exists).toBe(true);
    expect(result.vars.length).toBeGreaterThan(0);
  });

  test('masks secret variables by default', () => {
    const p      = tmpFile('mask-test.env', SAMPLE_ENV);
    const result = readEnvFile(p);
    const jwt    = result.vars.find(v => v.key === 'JWT_SECRET');
    expect(jwt).toBeDefined();
    expect(jwt.masked).toBe(true);
    expect(jwt.value).toContain('*');
    expect(jwt.value).not.toBe('supersecretkey1234567890abcdef');
  });

  test('does not mask non-secret values', () => {
    const p      = tmpFile('plain-test.env', SAMPLE_ENV);
    const result = readEnvFile(p);
    const port   = result.vars.find(v => v.key === 'PORT');
    expect(port.masked).toBe(false);
    expect(port.value).toBe('3000');
  });

  test('reports count of masked secrets', () => {
    const p      = tmpFile('count-test.env', SAMPLE_ENV);
    const result = readEnvFile(p);
    expect(result.masked).toBeGreaterThan(0);
  });

  test('revealKeys shows specific secret unmasked', () => {
    const p      = tmpFile('reveal-test.env', 'SECRET=mysecretvalue12345\n');
    const result = readEnvFile(p, { revealKeys: ['SECRET'] });
    const v      = result.vars.find(v => v.key === 'SECRET');
    expect(v.masked).toBe(false);
    expect(v.value).toBe('mysecretvalue12345');
  });

  test('showSecrets:true reveals all values', () => {
    const p      = tmpFile('all-reveal.env', SAMPLE_ENV);
    const result = readEnvFile(p, { showSecrets: true });
    const jwt    = result.vars.find(v => v.key === 'JWT_SECRET');
    expect(jwt.masked).toBe(false);
    expect(jwt.value).toBe('supersecretkey1234567890abcdef');
  });
});

// ─────────────────────────────────────────────
//  setEnvVar
// ─────────────────────────────────────────────

describe('setEnvVar', () => {
  test('creates new .env file with variable', () => {
    const p = path.join(TMP, 'new-create.env');
    setEnvVar(p, 'PORT', '3000');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toContain('PORT=3000');
  });

  test('adds new variable to existing file', () => {
    const p = tmpFile('add-var.env', 'EXISTING=value\n');
    setEnvVar(p, 'NEW_VAR', 'newvalue');
    expect(fs.readFileSync(p, 'utf8')).toContain('NEW_VAR=newvalue');
    expect(fs.readFileSync(p, 'utf8')).toContain('EXISTING=value');
  });

  test('updates existing variable', () => {
    const p = tmpFile('update-var.env', 'PORT=3000\n');
    const result = setEnvVar(p, 'PORT', '4000');
    expect(result.action).toBe('updated');
    expect(fs.readFileSync(p, 'utf8')).toContain('PORT=4000');
    expect(fs.readFileSync(p, 'utf8')).not.toContain('PORT=3000');
  });

  test('returns action:created for new file', () => {
    const p = path.join(TMP, 'action-created.env');
    const result = setEnvVar(p, 'KEY', 'val');
    expect(result.action).toBe('created');
  });

  test('returns action:updated for existing key', () => {
    const p = tmpFile('action-updated.env', 'KEY=old\n');
    const result = setEnvVar(p, 'KEY', 'new');
    expect(result.action).toBe('updated');
  });

  test('adds comment above variable', () => {
    const p = path.join(TMP, 'with-comment.env');
    setEnvVar(p, 'PORT', '3000', { comment: 'Server port' });
    const content = fs.readFileSync(p, 'utf8');
    expect(content).toContain('# Server port');
    expect(content).toContain('PORT=3000');
  });

  test('throws on invalid variable name', () => {
    const p = path.join(TMP, 'invalid-name.env');
    expect(() => setEnvVar(p, 'invalid-name', 'value')).toThrow(/invalid/i);
    expect(() => setEnvVar(p, '123STARTS_WITH_NUMBER', 'value')).toThrow(/invalid/i);
  });

  test('masks secret in result', () => {
    const p      = path.join(TMP, 'secret-result.env');
    const result = setEnvVar(p, 'API_SECRET', 'sk-supersecretkey12345678901234');
    expect(result.masked).toBe(true);
  });

  test('does not mask non-secret in result', () => {
    const p      = path.join(TMP, 'plain-result.env');
    const result = setEnvVar(p, 'PORT', '3000');
    expect(result.masked).toBe(false);
  });
});

// ─────────────────────────────────────────────
//  deleteEnvVar
// ─────────────────────────────────────────────

describe('deleteEnvVar', () => {
  test('removes a variable from the file', () => {
    const p = tmpFile('delete-var.env', 'PORT=3000\nNODE_ENV=development\n');
    const result = deleteEnvVar(p, 'PORT');
    expect(result.deleted).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).not.toContain('PORT=3000');
    expect(fs.readFileSync(p, 'utf8')).toContain('NODE_ENV=development');
  });

  test('returns deleted:false when key not found', () => {
    const p      = tmpFile('delete-missing.env', 'PORT=3000\n');
    const result = deleteEnvVar(p, 'NONEXISTENT');
    expect(result.deleted).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  test('throws when file does not exist', () => {
    expect(() => deleteEnvVar(path.join(TMP, 'ghost.env'), 'KEY'))
      .toThrow(/not found/i);
  });
});

// ─────────────────────────────────────────────
//  findEnvFiles
// ─────────────────────────────────────────────

describe('findEnvFiles', () => {
  test('finds .env files', () => {
    const dir = path.join(TMP, 'find-test');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.env'), 'A=1\n');
    fs.writeFileSync(path.join(dir, '.env.local'), 'B=2\n');
    fs.writeFileSync(path.join(dir, '.env.production'), 'C=3\n');

    const files = findEnvFiles(dir);
    expect(files.length).toBe(3);
    expect(files.some(f => f.endsWith('.env'))).toBe(true);
    expect(files.some(f => f.endsWith('.env.local'))).toBe(true);
    expect(files.some(f => f.endsWith('.env.production'))).toBe(true);
  });

  test('does not return non-.env files', () => {
    const dir = path.join(TMP, 'find-test2');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.env'), 'A=1\n');
    fs.writeFileSync(path.join(dir, 'config.js'), 'module.exports = {}');

    const files = findEnvFiles(dir);
    expect(files.every(f => path.basename(f).startsWith('.env'))).toBe(true);
  });

  test('returns empty array for directory with no .env files', () => {
    const dir = path.join(TMP, 'no-env');
    fs.mkdirSync(dir, { recursive: true });
    expect(findEnvFiles(dir)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
//  checkRequiredVars
// ─────────────────────────────────────────────

describe('checkRequiredVars', () => {
  test('returns empty missing when all vars present', () => {
    const p      = tmpFile('check-all.env', 'PORT=3000\nNODE_ENV=development\n');
    const result = checkRequiredVars(p, ['PORT', 'NODE_ENV']);
    expect(result.missing).toHaveLength(0);
    expect(result.present).toContain('PORT');
    expect(result.present).toContain('NODE_ENV');
  });

  test('returns missing vars correctly', () => {
    const p      = tmpFile('check-missing.env', 'PORT=3000\n');
    const result = checkRequiredVars(p, ['PORT', 'DATABASE_URL', 'JWT_SECRET']);
    expect(result.missing).toContain('DATABASE_URL');
    expect(result.missing).toContain('JWT_SECRET');
    expect(result.present).toContain('PORT');
  });

  test('all missing when file does not exist', () => {
    const p      = path.join(TMP, 'nonexistent.env');
    const result = checkRequiredVars(p, ['PORT', 'SECRET']);
    expect(result.missing).toContain('PORT');
    expect(result.missing).toContain('SECRET');
  });
});

// ─────────────────────────────────────────────
//  formatEnvReadResult
// ─────────────────────────────────────────────

describe('formatEnvReadResult', () => {
  test('shows file path and count', () => {
    const p      = tmpFile('format-test.env', 'PORT=3000\n');
    const result = readEnvFile(p);
    const fmt    = formatEnvReadResult(result);
    expect(fmt).toContain('format-test.env');
    expect(fmt).toMatch(/\d+ variable/);
  });

  test('shows masked warning when secrets present', () => {
    const p      = tmpFile('format-secret.env', 'JWT_SECRET=supersecretkey1234567890\n');
    const result = readEnvFile(p);
    const fmt    = formatEnvReadResult(result);
    expect(fmt).toMatch(/masked/i);
  });

  test('shows "File not found" for missing file', () => {
    const result = readEnvFile(path.join(TMP, 'missing.env'));
    const fmt    = formatEnvReadResult(result);
    expect(fmt).toMatch(/not found/i);
  });

  test('shows lock emoji for secret variables', () => {
    const p      = tmpFile('lock-emoji.env', 'JWT_SECRET=supersecretkey1234567890\n');
    const result = readEnvFile(p);
    const fmt    = formatEnvReadResult(result);
    expect(fmt).toContain('🔒');
  });
});

// ─────────────────────────────────────────────
//  Tool registration
// ─────────────────────────────────────────────

describe('Env tools registration', () => {
  test('all 5 env tools are registered', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('read_env');
    expect(Object.keys(TOOLS)).toContain('set_env_var');
    expect(Object.keys(TOOLS)).toContain('delete_env_var');
    expect(Object.keys(TOOLS)).toContain('list_env_files');
    expect(Object.keys(TOOLS)).toContain('check_env_vars');
  });

  test('total tool count is now 31', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(31);
  });

  test('read_env description mentions masking', () => {
    const { TOOLS } = require('../src/tools');
    expect(TOOLS.read_env.description).toMatch(/mask/i);
  });
});
