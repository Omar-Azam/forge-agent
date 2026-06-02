// tests/tools.test.js — Day 1: Full test suite for all 15 tools
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TMP_DIR = path.join(os.tmpdir(), 'dsa-test-' + Date.now());
fs.mkdirSync(TMP_DIR, { recursive: true });

// Jest mock factories run in a sandboxed scope and cannot reference outer
// variables. Store the path in an env var so the factory can read it.
process.env._DSA_TEST_DIR = TMP_DIR;

jest.mock('../src/config', () => ({
  WORKING_DIR      : process.env._DSA_TEST_DIR,
  MAX_OUTPUT_LENGTH: 8000,
  SESSION_DIR      : require('path').join(require('os').tmpdir(), 'dsa-test-session'),
  DEBUG            : false,
}));

const { executeTool, TOOLS } = require('../src/tools');

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────

function tmp(...parts) {
  return path.join(TMP_DIR, ...parts);
}

async function writeTemp(relPath, content) {
  const abs = tmp(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// ─────────────────────────────────────────────────────────
//  Cleanup
// ─────────────────────────────────────────────────────────

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────
//  Tool registry
// ─────────────────────────────────────────────────────────

describe('Tool registry', () => {
  const EXPECTED_TOOLS = [
    'read_file', 'write_file', 'append_to_file', 'replace_in_file',
    'delete_file', 'list_directory', 'create_directory', 'move_file',
    'copy_file', 'get_file_info', 'run_command', 'find_files',
    'search_in_files', 'read_url', 'write_files',
  ];

  test('all 15 tools are registered', () => {
    const registered = Object.keys(TOOLS);
    EXPECTED_TOOLS.forEach(name => {
      expect(registered).toContain(name);
    });
    expect(registered.length).toBeGreaterThanOrEqual(15);
  });

  test('every tool has a description, parameters, and execute function', () => {
    Object.entries(TOOLS).forEach(([name, tool]) => {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(5);
      expect(typeof tool.parameters).toBe('object');
      expect(typeof tool.execute).toBe('function');
    });
  });

  test('unknown tool throws a helpful error', async () => {
    await expect(executeTool('nonexistent_tool', {}))
      .rejects.toThrow('Unknown tool');
  });
});

// ─────────────────────────────────────────────────────────
//  write_file
// ─────────────────────────────────────────────────────────

describe('write_file', () => {
  test('creates a new file with content', async () => {
    const result = await executeTool('write_file', {
      path: tmp('write_test.txt'), content: 'hello world',
    });
    expect(result).toMatch(/✓/);
    expect(fs.readFileSync(tmp('write_test.txt'), 'utf8')).toBe('hello world');
  });

  test('overwrites an existing file', async () => {
    await writeTemp('overwrite.txt', 'old content');
    await executeTool('write_file', { path: tmp('overwrite.txt'), content: 'new content' });
    expect(fs.readFileSync(tmp('overwrite.txt'), 'utf8')).toBe('new content');
  });

  test('creates parent directories automatically', async () => {
    const deep = tmp('a', 'b', 'c', 'deep.txt');
    await executeTool('write_file', { path: deep, content: 'deep' });
    expect(fs.existsSync(deep)).toBe(true);
  });

  test('reports byte size and line count', async () => {
    const result = await executeTool('write_file', {
      path: tmp('sized.txt'), content: 'line1\nline2\nline3',
    });
    expect(result).toMatch(/3 lines/);
  });
});

// ─────────────────────────────────────────────────────────
//  read_file
// ─────────────────────────────────────────────────────────

describe('read_file', () => {
  test('reads full file contents with line numbers', async () => {
    await writeTemp('read_me.txt', 'alpha\nbeta\ngamma');
    const result = await executeTool('read_file', { path: tmp('read_me.txt') });
    expect(result).toContain('alpha');
    expect(result).toContain('1:');
  });

  test('reads a specific line range', async () => {
    await writeTemp('lines.txt', 'one\ntwo\nthree\nfour\nfive');
    const result = await executeTool('read_file', {
      path: tmp('lines.txt'), start_line: 2, end_line: 3,
    });
    expect(result).toContain('two');
    expect(result).toContain('three');
    expect(result).not.toContain('one');
    expect(result).not.toContain('four');
  });

  test('throws when file does not exist', async () => {
    await expect(executeTool('read_file', { path: tmp('ghost.txt') }))
      .rejects.toThrow(/not found/i);
  });

  test('throws when path is a directory', async () => {
    await expect(executeTool('read_file', { path: TMP_DIR }))
      .rejects.toThrow(/Cannot read file/i);
  });
});

// ─────────────────────────────────────────────────────────
//  append_to_file
// ─────────────────────────────────────────────────────────

describe('append_to_file', () => {
  test('appends to existing file', async () => {
    await writeTemp('append.txt', 'line1\n');
    await executeTool('append_to_file', { path: tmp('append.txt'), content: 'line2\n' });
    expect(fs.readFileSync(tmp('append.txt'), 'utf8')).toBe('line1\nline2\n');
  });

  test('creates file if it does not exist', async () => {
    const p = tmp('new_append.txt');
    await executeTool('append_to_file', { path: p, content: 'created' });
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toBe('created');
  });
});

// ─────────────────────────────────────────────────────────
//  replace_in_file
// ─────────────────────────────────────────────────────────

describe('replace_in_file', () => {
  test('replaces all occurrences by default', async () => {
    await writeTemp('replace.txt', 'foo bar foo baz foo');
    await executeTool('replace_in_file', {
      path: tmp('replace.txt'), find: 'foo', replace: 'qux',
    });
    expect(fs.readFileSync(tmp('replace.txt'), 'utf8')).toBe('qux bar qux baz qux');
  });

  test('replaces only first occurrence when all_occurrences is false', async () => {
    await writeTemp('replace_once.txt', 'foo foo foo');
    await executeTool('replace_in_file', {
      path: tmp('replace_once.txt'), find: 'foo', replace: 'bar', all_occurrences: false,
    });
    expect(fs.readFileSync(tmp('replace_once.txt'), 'utf8')).toBe('bar foo foo');
  });

  test('supports regex patterns', async () => {
    await writeTemp('regex.txt', 'cat123 dog456 bird789');
    await executeTool('replace_in_file', {
      path: tmp('regex.txt'), find: '\\d+', replace: 'NUM', use_regex: true,
    });
    expect(fs.readFileSync(tmp('regex.txt'), 'utf8')).toBe('catNUM dogNUM birdNUM');
  });

  test('warns when no match found', async () => {
    await writeTemp('nomatch.txt', 'nothing here');
    const result = await executeTool('replace_in_file', {
      path: tmp('nomatch.txt'), find: 'xyz', replace: 'abc',
    });
    expect(result).toMatch(/No matches/);
  });
});

// ─────────────────────────────────────────────────────────
//  delete_file
// ─────────────────────────────────────────────────────────

describe('delete_file', () => {
  test('deletes an existing file', async () => {
    await writeTemp('to_delete.txt', 'bye');
    await executeTool('delete_file', { path: tmp('to_delete.txt') });
    expect(fs.existsSync(tmp('to_delete.txt'))).toBe(false);
  });

  test('throws when file does not exist', async () => {
    await expect(executeTool('delete_file', { path: tmp('ghost.txt') }))
      .rejects.toThrow('not found');
  });
});

// ─────────────────────────────────────────────────────────
//  list_directory
// ─────────────────────────────────────────────────────────

describe('list_directory', () => {
  test('lists files and directories', async () => {
    const dir = tmp('list_test');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.txt'), '');
    fs.writeFileSync(path.join(dir, 'b.txt'), '');
    fs.mkdirSync(path.join(dir, 'subdir'), { recursive: true });

    const result = await executeTool('list_directory', { path: dir });
    expect(result).toContain('a.txt');
    expect(result).toContain('b.txt');
    expect(result).toContain('subdir');
  });

  test('throws on non-existent directory', async () => {
    await expect(executeTool('list_directory', { path: tmp('nope') }))
      .rejects.toThrow('not found');
  });

  test('throws when path is a file', async () => {
    await writeTemp('not_a_dir.txt', 'x');
    await expect(executeTool('list_directory', { path: tmp('not_a_dir.txt') }))
      .rejects.toThrow(/Not a directory/i);
  });
});

// ─────────────────────────────────────────────────────────
//  create_directory
// ─────────────────────────────────────────────────────────

describe('create_directory', () => {
  test('creates a directory', async () => {
    const p = tmp('new_dir');
    await executeTool('create_directory', { path: p });
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  test('creates nested directories', async () => {
    const p = tmp('x', 'y', 'z');
    await executeTool('create_directory', { path: p });
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  test('does not throw if directory already exists', async () => {
    const p = tmp('already_exists');
    fs.mkdirSync(p, { recursive: true });
    await expect(executeTool('create_directory', { path: p })).resolves.toMatch(/✓/);
  });
});

// ─────────────────────────────────────────────────────────
//  move_file
// ─────────────────────────────────────────────────────────

describe('move_file', () => {
  test('moves a file to a new location', async () => {
    await writeTemp('move_src.txt', 'moving');
    await executeTool('move_file', {
      source: tmp('move_src.txt'), destination: tmp('move_dst.txt'),
    });
    expect(fs.existsSync(tmp('move_src.txt'))).toBe(false);
    expect(fs.readFileSync(tmp('move_dst.txt'), 'utf8')).toBe('moving');
  });

  test('renames a file in the same directory', async () => {
    await writeTemp('rename_me.txt', 'data');
    await executeTool('move_file', {
      source: tmp('rename_me.txt'), destination: tmp('renamed.txt'),
    });
    expect(fs.existsSync(tmp('rename_me.txt'))).toBe(false);
    expect(fs.existsSync(tmp('renamed.txt'))).toBe(true);
  });

  test('throws when source does not exist', async () => {
    await expect(executeTool('move_file', {
      source: tmp('no_such.txt'), destination: tmp('dst.txt'),
    })).rejects.toThrow('not found');
  });
});

// ─────────────────────────────────────────────────────────
//  copy_file
// ─────────────────────────────────────────────────────────

describe('copy_file', () => {
  test('copies a file', async () => {
    await writeTemp('copy_src.txt', 'original');
    await executeTool('copy_file', {
      source: tmp('copy_src.txt'), destination: tmp('copy_dst.txt'),
    });
    expect(fs.readFileSync(tmp('copy_src.txt'), 'utf8')).toBe('original');
    expect(fs.readFileSync(tmp('copy_dst.txt'), 'utf8')).toBe('original');
  });

  test('throws when source does not exist', async () => {
    await expect(executeTool('copy_file', {
      source: tmp('missing.txt'), destination: tmp('out.txt'),
    })).rejects.toThrow('not found');
  });
});

// ─────────────────────────────────────────────────────────
//  get_file_info
// ─────────────────────────────────────────────────────────

describe('get_file_info', () => {
  test('returns metadata for a file', async () => {
    await writeTemp('info.txt', 'line1\nline2\nline3');
    const result = await executeTool('get_file_info', { path: tmp('info.txt') });
    const info = JSON.parse(result);
    expect(info.type).toBe('file');
    expect(info.lines).toBe(3);
    expect(info.size).toBeGreaterThan(0);
    expect(info.modified).toBeTruthy();
  });

  test('returns metadata for a directory', async () => {
    const result = await executeTool('get_file_info', { path: TMP_DIR });
    const info = JSON.parse(result);
    expect(info.type).toBe('directory');
  });

  test('throws for non-existent path', async () => {
    await expect(executeTool('get_file_info', { path: tmp('ghost') }))
      .rejects.toThrow(/not found/i);
  });
});

// ─────────────────────────────────────────────────────────
//  run_command
// ─────────────────────────────────────────────────────────

describe('run_command', () => {
  test('runs a simple command and returns output', async () => {
    const result = await executeTool('run_command', { command: 'echo hello_agent' });
    expect(result).toContain('hello_agent');
  });

  test('runs in the correct working directory', async () => {
    const result = await executeTool('run_command', { command: 'pwd', cwd: TMP_DIR });
    expect(result.trim()).toBe(TMP_DIR);
  });

  test('throws on command failure', async () => {
    await expect(executeTool('run_command', { command: 'exit 1' }))
      .rejects.toThrow();
  });

  test('respects timeout', async () => {
    await expect(
      executeTool('run_command', { command: 'sleep 10', timeout: 500 })
    ).rejects.toThrow();
  }, 3000);

  test('accepts extra environment variables', async () => {
    const result = await executeTool('run_command', {
      command: 'echo $MY_VAR', env: { MY_VAR: 'test_value' },
    });
    expect(result).toContain('test_value');
  });
});

// ─────────────────────────────────────────────────────────
//  find_files
// ─────────────────────────────────────────────────────────

describe('find_files', () => {
  beforeAll(async () => {
    await writeTemp('find_dir/alpha.js', '');
    await writeTemp('find_dir/beta.js', '');
    await writeTemp('find_dir/gamma.txt', '');
    await writeTemp('find_dir/sub/delta.js', '');
  });

  test('finds files matching a pattern', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.js', directory: tmp('find_dir'),
    });
    expect(result).toContain('alpha.js');
    expect(result).toContain('beta.js');
    expect(result).toContain('delta.js');
    expect(result).not.toContain('gamma.txt');
  });

  test('returns message when no files found', async () => {
    const result = await executeTool('find_files', {
      pattern: '*.py', directory: tmp('find_dir'),
    });
    expect(result).toMatch(/No files/);
  });
});

// ─────────────────────────────────────────────────────────
//  search_in_files
// ─────────────────────────────────────────────────────────

describe('search_in_files', () => {
  beforeAll(async () => {
    await writeTemp('search_dir/a.js', 'function hello() {}\nconst world = 1;');
    await writeTemp('search_dir/b.js', 'function goodbye() {}\nconst hello = 2;');
    await writeTemp('search_dir/c.txt', 'no matches here');
  });

  test('finds matching lines across files', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'hello', directory: tmp('search_dir'),
    });
    expect(result).toContain('a.js');
    expect(result).toContain('b.js');
  });

  test('filters by file pattern', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'hello', directory: tmp('search_dir'), file_pattern: '*.js',
    });
    expect(result).not.toContain('c.txt');
  });

  test('returns message when no matches', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'xyzzy_no_match', directory: tmp('search_dir'),
    });
    expect(result).toMatch(/No matches/);
  });

  test('case-insensitive search by default', async () => {
    const result = await executeTool('search_in_files', {
      pattern: 'HELLO', directory: tmp('search_dir'),
    });
    expect(result).toContain('hello');
  });
});

// ─────────────────────────────────────────────────────────
//  write_files (batch)
// ─────────────────────────────────────────────────────────

describe('write_files', () => {
  test('writes multiple files at once', async () => {
    const result = await executeTool('write_files', {
      files: [
        { path: tmp('batch', 'one.txt'), content: 'file one' },
        { path: tmp('batch', 'two.txt'), content: 'file two' },
        { path: tmp('batch', 'three.txt'), content: 'file three' },
      ],
    });
    expect(result).toContain('3 files');
    expect(fs.readFileSync(tmp('batch', 'one.txt'), 'utf8')).toBe('file one');
    expect(fs.readFileSync(tmp('batch', 'two.txt'), 'utf8')).toBe('file two');
    expect(fs.readFileSync(tmp('batch', 'three.txt'), 'utf8')).toBe('file three');
  });

  test('throws when files is not an array', async () => {
    await expect(executeTool('write_files', { files: 'not an array' }))
      .rejects.toThrow('"files" must be an array');
  });

  test('creates parent directories for each file', async () => {
    await executeTool('write_files', {
      files: [
        { path: tmp('deep', 'nested', 'path', 'file.txt'), content: 'deep' },
      ],
    });
    expect(fs.existsSync(tmp('deep', 'nested', 'path', 'file.txt'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
//  read_url
// ─────────────────────────────────────────────────────────

describe('read_url', () => {
  test('fetches content from a real URL', async () => {
    const result = await executeTool('read_url', { url: 'http://example.com' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(10);
  }, 15000);

  test('rejects on invalid URL', async () => {
    await expect(executeTool('read_url', { url: 'http://localhost:1' }))
      .rejects.toThrow();
  }, 10000);
});
