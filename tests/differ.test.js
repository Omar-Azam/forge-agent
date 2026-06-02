// tests/differ.test.js — Day 15: Diff and patch tests
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
  generateDiff,
  diffFiles,
  parseDiff,
  applyPatch,
  diffStats,
  summariseDiff,
  myersDiff,
} = require('../src/differ');

// ─────────────────────────────────────────────
//  Fixtures
// ─────────────────────────────────────────────

const TMP = path.join(os.tmpdir(), 'dsa-diff-test-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

function write(name, content) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const ORIGINAL = [
  'function hello() {',
  '  console.log("hello");',
  '}',
  '',
  'function world() {',
  '  console.log("world");',
  '}',
].join('\n');

const MODIFIED = [
  'function hello() {',
  '  console.log("hello, world!");',
  '}',
  '',
  'function world() {',
  '  console.log("world");',
  '}',
  '',
  'function goodbye() {',
  '  console.log("goodbye");',
  '}',
].join('\n');

const SIMPLE_A = 'line1\nline2\nline3\n';
const SIMPLE_B = 'line1\nLINE2\nline3\n';

// ─────────────────────────────────────────────
//  myersDiff
// ─────────────────────────────────────────────

describe('myersDiff', () => {
  test('identical arrays produce all-equal edits', () => {
    const edits = myersDiff(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(edits.every(e => e.type === 'equal')).toBe(true);
  });

  test('empty arrays produce no edits', () => {
    expect(myersDiff([], [])).toHaveLength(0);
  });

  test('detects single line change', () => {
    const edits = myersDiff(['line1', 'line2', 'line3'], ['line1', 'LINE2', 'line3']);
    const changed = edits.filter(e => e.type !== 'equal');
    expect(changed.length).toBeGreaterThan(0);
    expect(edits.some(e => e.type === 'delete')).toBe(true);
    expect(edits.some(e => e.type === 'insert')).toBe(true);
  });

  test('detects insertion', () => {
    const edits = myersDiff(['a', 'c'], ['a', 'b', 'c']);
    expect(edits.some(e => e.type === 'insert')).toBe(true);
    expect(edits.filter(e => e.type === 'delete')).toHaveLength(0);
  });

  test('detects deletion', () => {
    const edits = myersDiff(['a', 'b', 'c'], ['a', 'c']);
    expect(edits.some(e => e.type === 'delete')).toBe(true);
    expect(edits.filter(e => e.type === 'insert')).toHaveLength(0);
  });

  test('produces minimal edit distance', () => {
    // Changing one line should produce 1 delete + 1 insert
    const edits   = myersDiff(['a', 'b', 'c'], ['a', 'X', 'c']);
    const deletes = edits.filter(e => e.type === 'delete');
    const inserts = edits.filter(e => e.type === 'insert');
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
//  generateDiff
// ─────────────────────────────────────────────

describe('generateDiff', () => {
  test('returns empty string for identical content', () => {
    expect(generateDiff('hello\n', 'hello\n')).toBe('');
  });

  test('returns unified diff format', () => {
    const diff = generateDiff(SIMPLE_A, SIMPLE_B);
    expect(diff).toContain('---');
    expect(diff).toContain('+++');
    expect(diff).toContain('@@');
  });

  test('shows deleted line with - prefix', () => {
    const diff = generateDiff(SIMPLE_A, SIMPLE_B);
    expect(diff).toContain('-line2');
  });

  test('shows added line with + prefix', () => {
    const diff = generateDiff(SIMPLE_A, SIMPLE_B);
    expect(diff).toContain('+LINE2');
  });

  test('includes context lines', () => {
    const diff = generateDiff(SIMPLE_A, SIMPLE_B);
    expect(diff).toContain(' line1');
    expect(diff).toContain(' line3');
  });

  test('uses provided labels in headers', () => {
    const diff = generateDiff('a\n', 'b\n', 'original.js', 'modified.js');
    expect(diff).toContain('--- original.js');
    expect(diff).toContain('+++ modified.js');
  });

  test('handles multi-hunk diffs', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');
    const b = a.replace('line1', 'LINE1').replace('line20', 'LINE20');
    const diff = generateDiff(a, b);
    const hunkCount = (diff.match(/^@@/gm) || []).length;
    expect(hunkCount).toBeGreaterThanOrEqual(2);
  });

  test('handles adding lines at end', () => {
    const diff = generateDiff(ORIGINAL, MODIFIED);
    expect(diff).toContain('+function goodbye()');
  });

  test('handles changing a line', () => {
    const diff = generateDiff(ORIGINAL, MODIFIED);
    expect(diff).toContain('-  console.log("hello");');
    expect(diff).toContain('+  console.log("hello, world!");');
  });
});

// ─────────────────────────────────────────────
//  diffFiles
// ─────────────────────────────────────────────

describe('diffFiles', () => {
  test('generates diff between two files on disk', () => {
    const a = write('a.js', SIMPLE_A);
    const b = write('b.js', SIMPLE_B);
    const diff = diffFiles(a, b);
    expect(diff).toContain('-line2');
    expect(diff).toContain('+LINE2');
  });

  test('returns empty for identical files', () => {
    const a = write('same1.txt', 'identical content\n');
    const b = write('same2.txt', 'identical content\n');
    expect(diffFiles(a, b)).toBe('');
  });
});

// ─────────────────────────────────────────────
//  parseDiff
// ─────────────────────────────────────────────

describe('parseDiff', () => {
  test('parses labels from diff header', () => {
    const diff   = generateDiff(SIMPLE_A, SIMPLE_B, 'a/old.js', 'b/new.js');
    const parsed = parseDiff(diff);
    expect(parsed.aLabel).toBe('a/old.js');
    expect(parsed.bLabel).toBe('b/new.js');
  });

  test('parses hunk headers', () => {
    const diff   = generateDiff(SIMPLE_A, SIMPLE_B);
    const parsed = parseDiff(diff);
    expect(parsed.hunks.length).toBeGreaterThan(0);
    expect(typeof parsed.hunks[0].aStart).toBe('number');
    expect(typeof parsed.hunks[0].bStart).toBe('number');
  });

  test('parses hunk lines', () => {
    const diff   = generateDiff(SIMPLE_A, SIMPLE_B);
    const parsed = parseDiff(diff);
    const lines  = parsed.hunks[0].lines;
    expect(lines.some(l => l.startsWith('-'))).toBe(true);
    expect(lines.some(l => l.startsWith('+'))).toBe(true);
    expect(lines.some(l => l.startsWith(' '))).toBe(true);
  });

  test('returns empty hunks for empty diff', () => {
    const parsed = parseDiff('');
    expect(parsed.hunks).toHaveLength(0);
  });

  test('parses multi-hunk diffs', () => {
    const a      = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');
    const b      = a.replace('line1', 'LINE1').replace('line20', 'LINE20');
    const diff   = generateDiff(a, b);
    const parsed = parseDiff(diff);
    expect(parsed.hunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────
//  applyPatch
// ─────────────────────────────────────────────

describe('applyPatch', () => {
  test('applies a simple one-line change', () => {
    const diff   = generateDiff(SIMPLE_A, SIMPLE_B);
    const result = applyPatch(SIMPLE_A, diff);
    expect(result.success).toBe(true);
    expect(result.content).toContain('LINE2');
    expect(result.content).not.toContain('line2\n');
  });

  test('result matches expected output', () => {
    const diff   = generateDiff(SIMPLE_A, SIMPLE_B);
    const result = applyPatch(SIMPLE_A, diff);
    expect(result.content.trim()).toBe(SIMPLE_B.trim());
  });

  test('applying then reversing restores original', () => {
    const diff    = generateDiff(SIMPLE_A, SIMPLE_B);
    const applied = applyPatch(SIMPLE_A, diff);
    const reversed = applyPatch(applied.content, diff, { reverse: true });
    expect(reversed.content.trim()).toBe(SIMPLE_A.trim());
  });

  test('handles multi-hunk patch', () => {
    const diff   = generateDiff(ORIGINAL, MODIFIED);
    const result = applyPatch(ORIGINAL, diff);
    expect(result.success).toBe(true);
    expect(result.content).toContain('hello, world!');
    expect(result.content).toContain('goodbye');
  });

  test('returns error for empty diff', () => {
    const result = applyPatch(SIMPLE_A, '');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('errors array is empty on clean apply', () => {
    const diff   = generateDiff(SIMPLE_A, SIMPLE_B);
    const result = applyPatch(SIMPLE_A, diff);
    expect(result.errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
//  diffStats
// ─────────────────────────────────────────────

describe('diffStats', () => {
  test('counts additions correctly', () => {
    const diff  = generateDiff(SIMPLE_A, SIMPLE_B);
    const stats = diffStats(diff);
    expect(stats.additions).toBeGreaterThan(0);
  });

  test('counts deletions correctly', () => {
    const diff  = generateDiff(SIMPLE_A, SIMPLE_B);
    const stats = diffStats(diff);
    expect(stats.deletions).toBeGreaterThan(0);
  });

  test('counts hunks correctly', () => {
    const diff  = generateDiff(SIMPLE_A, SIMPLE_B);
    const stats = diffStats(diff);
    expect(stats.hunks).toBeGreaterThan(0);
  });

  test('net is additions minus deletions', () => {
    const diff  = generateDiff(SIMPLE_A, SIMPLE_B);
    const stats = diffStats(diff);
    expect(stats.net).toBe(stats.additions - stats.deletions);
  });

  test('returns zeros for empty diff', () => {
    const stats = diffStats('');
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
    expect(stats.hunks).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  summariseDiff
// ─────────────────────────────────────────────

describe('summariseDiff', () => {
  test('includes filename', () => {
    const diff    = generateDiff(SIMPLE_A, SIMPLE_B);
    const summary = summariseDiff(diff, 'src/utils.js');
    expect(summary).toContain('src/utils.js');
  });

  test('shows + and - counts', () => {
    const diff    = generateDiff(SIMPLE_A, SIMPLE_B);
    const summary = summariseDiff(diff, 'file.js');
    expect(summary).toMatch(/\+\d+/);
    expect(summary).toMatch(/-\d+/);
  });

  test('returns "No changes" for empty diff', () => {
    const summary = summariseDiff('', 'file.js');
    expect(summary).toMatch(/no changes/i);
  });
});

// ─────────────────────────────────────────────
//  diff_files tool integration
// ─────────────────────────────────────────────

describe('diff_files + patch_file tool integration', () => {
  const mockConfig = {
    WORKING_DIR      : TMP,
    MAX_OUTPUT_LENGTH: 8000,
    STRICT_SANDBOX   : false,
    DEBUG            : false,
    SESSION_DIR      : os.tmpdir(),
  };

  jest.mock('../src/config', () => mockConfig, { virtual: false });

  test('diff_files tool is registered', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('diff_files');
  });

  test('patch_file tool is registered', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('patch_file');
  });

  test('total tool count is now 26', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(26);
  });

  test('diff_files tool executes with new_content', async () => {
    const { executeTool } = require('../src/tools');
    const filePath = write('diff-test.js', SIMPLE_A);
    const result   = await executeTool('diff_files', {
      path_a      : filePath,
      new_content : SIMPLE_B,
    });
    expect(result).toContain('-line2');
    expect(result).toContain('+LINE2');
  });

  test('diff_files returns "No differences" for identical content', async () => {
    const { executeTool } = require('../src/tools');
    const filePath = write('same-test.js', SIMPLE_A);
    const result   = await executeTool('diff_files', {
      path_a      : filePath,
      new_content : SIMPLE_A,
    });
    expect(result).toMatch(/identical|no differences/i);
  });

  test('patch_file dry_run does not modify file', async () => {
    const { executeTool } = require('../src/tools');
    const filePath = write('patch-dry.js', SIMPLE_A);
    const diff     = generateDiff(SIMPLE_A, SIMPLE_B);

    const result = await executeTool('patch_file', {
      path   : filePath,
      patch  : diff,
      dry_run: true,
    });

    expect(result).toMatch(/dry run/i);
    // File should be unchanged
    expect(fs.readFileSync(filePath, 'utf8')).toBe(SIMPLE_A);
  });

  test('patch_file applies patch and writes file', async () => {
    const { executeTool } = require('../src/tools');
    const filePath = write('patch-apply.js', SIMPLE_A);
    const diff     = generateDiff(SIMPLE_A, SIMPLE_B);

    const result = await executeTool('patch_file', {
      path   : filePath,
      patch  : diff,
      dry_run: false,
    });

    expect(result).toMatch(/✓ Applied/);
    expect(fs.readFileSync(filePath, 'utf8')).toContain('LINE2');
  });

  test('patch_file creates .orig backup', async () => {
    const { executeTool } = require('../src/tools');
    const filePath = write('patch-backup.js', SIMPLE_A);
    const diff     = generateDiff(SIMPLE_A, SIMPLE_B);

    await executeTool('patch_file', { path: filePath, patch: diff });
    expect(fs.existsSync(filePath + '.orig')).toBe(true);
    expect(fs.readFileSync(filePath + '.orig', 'utf8')).toBe(SIMPLE_A);
  });
});
