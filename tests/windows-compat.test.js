// tests/windows-compat.test.js — Day 5: Cross-platform compatibility tests
//
// These tests run on any OS but specifically validate that:
//  1. All tools use pure Node.js (no Unix shell commands)
//  2. Path handling works correctly with both / and \ separators
//  3. Tools that previously used `find` and `grep` now work cross-platform
//  4. The globToRegex helper matches patterns correctly
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TMP = path.join(os.tmpdir(), 'dsa-win-test-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

process.env._DSA_TEST_DIR = TMP;

jest.mock('../src/config', () => ({
  WORKING_DIR      : process.env._DSA_TEST_DIR,
  MAX_OUTPUT_LENGTH: 8000,
  SESSION_DIR      : require('path').join(require('os').tmpdir(), 'dsa-win-session'),
  DEBUG            : false,
}));

const { executeTool } = require('../src/tools');

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function tmp(...parts) {
  return path.join(TMP, ...parts);
}

async function write(relPath, content = 'test content') {
  const abs = tmp(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// ─────────────────────────────────────────────────────────
//  No Unix shell commands in source
// ─────────────────────────────────────────────────────────

describe('No Unix-only shell commands in tools.js', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/tools.js'), 'utf8'
  );

  test('does not call execSync with "find " command', () => {
    // Allow execSync itself but not execSync('find ...')
    const findShellCalls = src.match(/execSync\s*\([`'"]\s*find\s+/g);
    expect(findShellCalls).toBeNull();
  });

  test('does not call execSync with "grep " command', () => {
    const grepShellCalls = src.match(/execSync\s*\([`'"]\s*grep\s+/g);
    expect(grepShellCalls).toBeNull();
  });

  test('does not use Unix pipe operator in shell commands', () => {
    // We still use execSync for run_command (user-provided commands)
    // but our OWN shell strings should not use |
    const ownPipes = src.match(/execSync\s*\(`[^`]*\|[^`]*`/g);
    expect(ownPipes).toBeNull();
  });

  test('uses path.join instead of string concatenation for paths', () => {
    // Checks that we're not doing `dir + '/' + file` style path building
    const slashConcat = src.match(/['"`] \+ ['"`]\//g);
    expect(slashConcat).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
//  find_files — pure Node.js glob matching
// ─────────────────────────────────────────────────────────

describe('find_files — cross-platform', () => {
  beforeAll(async () => {
    await write('glob/alpha.js',    'const a = 1;');
    await write('glob/beta.js',     'const b = 2;');
    await write('glob/gamma.ts',    'const c = 3;');
    await write('glob/delta.test.js', 'test()');
    await write('glob/readme.txt',  'readme');
    await write('glob/sub/nested.js', 'nested');
    await write('glob/node_modules/pkg/index.js', 'pkg'); // should be excluded
  });

  test('finds *.js files', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.js', directory: tmp('glob'),
    });
    expect(result).toContain('alpha.js');
    expect(result).toContain('beta.js');
    expect(result).toContain('nested.js');
  });

  test('excludes node_modules automatically', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.js', directory: tmp('glob'),
    });
    expect(result).not.toContain('node_modules');
  });

  test('finds *.ts files', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.ts', directory: tmp('glob'),
    });
    expect(result).toContain('gamma.ts');
    expect(result).not.toContain('.js');
  });

  test('finds *.test.js pattern', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.test.js', directory: tmp('glob'),
    });
    expect(result).toContain('delta.test.js');
    expect(result).not.toContain('alpha.js');
  });

  test('finds files with wildcard prefix', async () => {
    const result = await executeTool('find_files', {
      pattern: 'alpha*', directory: tmp('glob'),
    });
    expect(result).toContain('alpha.js');
    expect(result).not.toContain('beta.js');
  });

  test('returns no-match message when nothing found', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.py', directory: tmp('glob'),
    });
    expect(result).toMatch(/No files/);
  });

  test('respects exclude parameter', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.js', directory: tmp('glob'), exclude: 'sub',
    });
    expect(result).not.toContain('nested.js');
    expect(result).toContain('alpha.js');
  });
});

// ─────────────────────────────────────────────────────────
//  search_in_files — pure Node.js grep replacement
// ─────────────────────────────────────────────────────────

describe('search_in_files — cross-platform', () => {
  beforeAll(async () => {
    await write('search/app.js',     'function hello() {\n  return "world";\n}\n\nhello();');
    await write('search/utils.js',   'const HELLO = "constant";\nexport default HELLO;');
    await write('search/styles.css', '.hello { color: red; }\n.world { color: blue; }');
    await write('search/README.md',  '# Hello World\nThis is a readme.');
    await write('search/node_modules/pkg/index.js', 'hello from pkg'); // excluded
  });

  test('finds pattern across multiple files', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'hello', directory: tmp('search'),
    });
    expect(result).toContain('app.js');
    expect(result).toContain('utils.js');
  });

  test('excludes node_modules from search', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'hello', directory: tmp('search'),
    });
    expect(result).not.toContain('node_modules');
  });

  test('is case-insensitive by default', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'HELLO', directory: tmp('search'),
    });
    // Should match "hello" in app.js even though we searched for "HELLO"
    expect(result).toContain('app.js');
  });

  test('is case-sensitive when specified', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'HELLO', directory: tmp('search'), case_sensitive: true,
    });
    // "HELLO" only appears in utils.js
    expect(result).toContain('utils.js');
    expect(result).not.toContain('app.js');
  });

  test('filters by file_pattern', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'hello', directory: tmp('search'), file_pattern: '*.css',
    });
    expect(result).toContain('styles.css');
    expect(result).not.toContain('app.js');
  });

  test('includes context lines around matches', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'return', directory: tmp('search'),
      file_pattern: '*.js', context_lines: 1,
    });
    // The line before "return" is "function hello() {"
    expect(result).toContain('hello');
  });

  test('shows line numbers in results', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'world', directory: tmp('search'), file_pattern: '*.js',
    });
    // Format is "filepath:linenum> content"
    expect(result).toMatch(/:\d+/);
  });

  test('supports regex patterns', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'hell[o0]', directory: tmp('search'),
    });
    expect(result).toContain('app.js');
  });

  test('returns no-match message when nothing found', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'xyzzy_impossible_string_12345', directory: tmp('search'),
    });
    expect(result).toMatch(/No matches/);
  });

  test('skips binary file extensions', async () => {
    // Create a fake binary file
    await write('search/image.png', '\x89PNG\r\n\x1a\n');
    const result = await executeTool('search_in_files', {
      pattern: 'PNG', directory: tmp('search'),
    });
    // Should not include .png files in search
    expect(result).not.toContain('image.png');
  });
});

// ─────────────────────────────────────────────────────────
//  list_directory recursive — pure Node.js
// ─────────────────────────────────────────────────────────

describe('list_directory recursive — cross-platform', () => {
  beforeAll(async () => {
    await write('ls_test/a.txt',               'a');
    await write('ls_test/sub/b.txt',           'b');
    await write('ls_test/sub/deep/c.txt',      'c');
    await write('ls_test/node_modules/x.js',   'x'); // excluded
    await write('ls_test/.hidden/secret.txt',  's'); // hidden
  });

  test('lists files recursively', async () => {
    const result = await executeTool('list_directory', {
      path: tmp('ls_test'), recursive: true,
    });
    expect(result).toContain('a.txt');
    expect(result).toContain('b.txt');
    expect(result).toContain('c.txt');
  });

  test('excludes node_modules from recursive listing', async () => {
    const result = await executeTool('list_directory', {
      path: tmp('ls_test'), recursive: true,
    });
    expect(result).not.toContain('node_modules');
  });

  test('excludes hidden files by default', async () => {
    const result = await executeTool('list_directory', {
      path: tmp('ls_test'), recursive: true,
    });
    expect(result).not.toContain('.hidden');
    expect(result).not.toContain('secret.txt');
  });

  test('includes hidden files when show_hidden is true', async () => {
    const result = await executeTool('list_directory', {
      path: tmp('ls_test'), recursive: true, show_hidden: true,
    });
    expect(result).toContain('secret.txt');
  });
});

// ─────────────────────────────────────────────────────────
//  Path handling — both separators
// ─────────────────────────────────────────────────────────

describe('Path separator handling', () => {
  test('write_file works with forward slashes', async () => {
    const result = await executeTool('write_file', {
      path: tmp('sep/forward/test.txt'),
      content: 'forward slash path',
    });
    expect(result).toMatch(/✓/);
    expect(fs.existsSync(tmp('sep', 'forward', 'test.txt'))).toBe(true);
  });

  test('read_file works with forward slashes', async () => {
    await write('sep/read/data.txt', 'data content');
    const result = await executeTool('read_file', {
      path: tmp('sep/read/data.txt'),
    });
    expect(result).toContain('data content');
  });

  test('paths with spaces work correctly', async () => {
    const result = await executeTool('write_file', {
      path: tmp('path with spaces/my file.txt'),
      content: 'spaces work',
    });
    expect(result).toMatch(/✓/);
  });

  test('deeply nested paths are created automatically', async () => {
    const deep = tmp('a', 'b', 'c', 'd', 'e', 'deep.txt');
    await executeTool('write_file', { path: deep, content: 'deep' });
    expect(fs.existsSync(deep)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
//  run_command — cross-platform command detection
// ─────────────────────────────────────────────────────────

describe('run_command — cross-platform basics', () => {
  test('runs node --version successfully', async () => {
    const result = await executeTool('run_command', {
      command: 'node --version',
    });
    expect(result).toMatch(/v\d+\.\d+/);
  });

  test('runs in specified working directory', async () => {
    fs.mkdirSync(tmp('cmd_dir'), { recursive: true });
    const result = await executeTool('run_command', {
      command: 'node -e "console.log(process.cwd())"',
      cwd    : tmp('cmd_dir'),
    });
    expect(result).toContain('cmd_dir');
  });

  test('passes environment variables', async () => {
    const result = await executeTool('run_command', {
      command: 'node -e "console.log(process.env.TEST_VAR)"',
      env    : { TEST_VAR: 'hello_from_env' },
    });
    expect(result).toContain('hello_from_env');
  });
});
