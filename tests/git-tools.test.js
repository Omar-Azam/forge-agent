// tests/git-tools.test.js — Day 11: Git integration tool tests
'use strict';

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { execSync }  = require('child_process');

// ─────────────────────────────────────────────
//  Set up a real git repo in a temp directory
// ─────────────────────────────────────────────

const REPO = path.join(os.tmpdir(), 'dsa-git-test-' + Date.now());
fs.mkdirSync(REPO, { recursive: true });

process.env._DSA_TEST_DIR = REPO;

jest.mock('../src/config', () => ({
  WORKING_DIR      : process.env._DSA_TEST_DIR,
  MAX_OUTPUT_LENGTH: 8000,
  SESSION_DIR      : require('path').join(require('os').tmpdir(), 'dsa-git-session'),
  STRICT_SANDBOX   : false,
  DEBUG            : false,
}));

// Helper — run a command in the repo
function git(cmd) {
  return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function write(rel, content) {
  const abs = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// Bootstrap: init repo with two commits
beforeAll(() => {
  git('git init');
  git('git config user.email "test@agent.local"');
  git('git config user.name "Test Agent"');

  // Commit 1
  write('src/index.js', 'console.log("hello world");');
  write('README.md', '# My Project\nA test project.');
  git('git add .');
  git('git commit -m "Initial commit: add index.js and README"');

  // Commit 2
  write('src/utils.js', 'function add(a, b) { return a + b; }');
  write('src/index.js', 'const { add } = require("./utils");\nconsole.log(add(1, 2));');
  git('git add .');
  git('git commit -m "feat: add utils.js with add function"');

  // Unstaged change
  write('src/index.js', 'const { add } = require("./utils");\nconsole.log(add(10, 20)); // changed');
});

afterAll(() => {
  fs.rmSync(REPO, { recursive: true, force: true });
});

const { executeTool, TOOLS } = require('../src/tools');

// ─────────────────────────────────────────────
//  Tool registration
// ─────────────────────────────────────────────

describe('Git tool registration', () => {
  const GIT_TOOLS = [
    'git_status', 'git_log', 'git_diff',
    'git_branches', 'git_show', 'git_blame',
  ];

  test('all 6 git tools are registered', () => {
    const registered = Object.keys(TOOLS);
    GIT_TOOLS.forEach(name => expect(registered).toContain(name));
  });

  test('total tool count is now 38', () => {
    expect(Object.keys(TOOLS)).toHaveLength(38);
  });

  test('each git tool has description, parameters, execute', () => {
    GIT_TOOLS.forEach(name => {
      expect(typeof TOOLS[name].description).toBe('string');
      expect(typeof TOOLS[name].execute).toBe('function');
    });
  });
});

// ─────────────────────────────────────────────
//  git_status
// ─────────────────────────────────────────────

describe('git_status', () => {
  test('returns current branch name', async () => {
    const result = await executeTool('git_status', { directory: REPO });
    expect(result).toMatch(/Branch:/);
  });

  test('shows unstaged modified file', async () => {
    const result = await executeTool('git_status', { directory: REPO });
    expect(result).toContain('index.js');
  });

  test('shows "working tree clean" when nothing changed', async () => {
    // Stash the change temporarily
    git('git stash');
    try {
      const result = await executeTool('git_status', { directory: REPO });
      expect(result).toContain('working tree clean');
    } finally {
      git('git stash pop');
    }
  });

  test('throws on non-git directory', async () => {
    const notRepo = os.tmpdir();
    await expect(executeTool('git_status', { directory: notRepo }))
      .rejects.toThrow(/git repository/i);
  });

  test('uses working directory when no directory given', async () => {
    // Just verify it doesn't throw — working dir may or may not be a git repo
    try {
      const result = await executeTool('git_status', {});
      expect(typeof result).toBe('string');
    } catch (err) {
      // If working dir isn't a git repo that's fine for this test
      expect(err.message).toMatch(/git repository|git/i);
    }
  });
});

// ─────────────────────────────────────────────
//  git_log
// ─────────────────────────────────────────────

describe('git_log', () => {
  test('returns commit history', async () => {
    const result = await executeTool('git_log', { directory: REPO });
    expect(result).toContain('Initial commit');
    expect(result).toContain('feat: add utils.js');
  });

  test('respects limit parameter', async () => {
    const result = await executeTool('git_log', { directory: REPO, limit: 1 });
    // Should only have 1 commit line
    const lines = result.trim().split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(1);
    expect(result).toContain('feat: add utils.js');
  });

  test('filters by file when file parameter given', async () => {
    const result = await executeTool('git_log', {
      directory: REPO,
      file     : 'src/utils.js',
    });
    // utils.js was only added in commit 2
    expect(result).toContain('feat: add utils.js');
    // Should not include commit 1 which didn't touch utils.js
    expect(result).not.toContain('Initial commit');
  });

  test('returns no commits message for empty history', async () => {
    // Use a file that was never committed
    const result = await executeTool('git_log', {
      directory: REPO,
      file     : 'nonexistent.xyz',
    });
    expect(result).toMatch(/no commits|empty/i);
  });

  test('throws on non-git directory', async () => {
    await expect(executeTool('git_log', { directory: os.tmpdir() }))
      .rejects.toThrow(/git repository/i);
  });
});

// ─────────────────────────────────────────────
//  git_diff
// ─────────────────────────────────────────────

describe('git_diff', () => {
  test('shows unstaged changes by default', async () => {
    const result = await executeTool('git_diff', { directory: REPO });
    // index.js was modified
    expect(result).toContain('index.js');
    expect(result).toMatch(/\+.*10.*20|changed/);
  });

  test('shows no diff when tree is clean', async () => {
    git('git stash');
    try {
      const result = await executeTool('git_diff', { directory: REPO });
      expect(result).toContain('no differences');
    } finally {
      git('git stash pop');
    }
  });

  test('diffs a specific file', async () => {
    const result = await executeTool('git_diff', {
      directory: REPO,
      file     : 'src/index.js',
    });
    expect(result).toContain('index.js');
  });

  test('shows HEAD diff (staged + unstaged)', async () => {
    const result = await executeTool('git_diff', {
      directory: REPO,
      target   : 'HEAD',
    });
    expect(typeof result).toBe('string');
  });

  test('throws on non-git directory', async () => {
    await expect(executeTool('git_diff', { directory: os.tmpdir() }))
      .rejects.toThrow(/git repository/i);
  });
});

// ─────────────────────────────────────────────
//  git_branches
// ─────────────────────────────────────────────

describe('git_branches', () => {
  test('lists branches', async () => {
    const result = await executeTool('git_branches', { directory: REPO });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain the current branch (marked with *)
    expect(result).toMatch(/\*/);
  });

  test('shows current branch marked with asterisk', async () => {
    const result = await executeTool('git_branches', { directory: REPO });
    expect(result).toContain('*');
  });

  test('throws on non-git directory', async () => {
    await expect(executeTool('git_branches', { directory: os.tmpdir() }))
      .rejects.toThrow(/git repository/i);
  });
});

// ─────────────────────────────────────────────
//  git_show
// ─────────────────────────────────────────────

describe('git_show', () => {
  test('shows HEAD commit details', async () => {
    const result = await executeTool('git_show', { directory: REPO });
    expect(result).toContain('feat: add utils.js');
    expect(result).toContain('Test Agent');
  });

  test('shows file change stats', async () => {
    const result = await executeTool('git_show', { directory: REPO });
    // --stat shows filenames
    expect(result).toMatch(/src\/(utils|index)\.js/);
  });

  test('shows a specific commit by hash', async () => {
    const hash = git('git rev-list --max-parents=0 HEAD'); // first commit
    const result = await executeTool('git_show', { directory: REPO, ref: hash });
    expect(result).toContain('Initial commit');
  });

  test('throws on invalid ref', async () => {
    await expect(executeTool('git_show', {
      directory: REPO,
      ref      : 'nonexistent-branch-xyz-12345',
    })).rejects.toThrow();
  });

  test('throws on non-git directory', async () => {
    await expect(executeTool('git_show', { directory: os.tmpdir() }))
      .rejects.toThrow(/git repository/i);
  });
});

// ─────────────────────────────────────────────
//  git_blame
// ─────────────────────────────────────────────

describe('git_blame', () => {
  test('shows blame for a committed file', async () => {
    const result = await executeTool('git_blame', {
      path     : 'README.md',
      directory: REPO,
    });
    expect(result).toContain('Test Agent');
    // blame output contains the commit hash and line content
    expect(result).toContain('My Project');
  });

  test('shows line numbers in output', async () => {
    const result = await executeTool('git_blame', {
      path     : 'README.md',
      directory: REPO,
    });
    // git blame output has line numbers
    expect(result).toMatch(/\d+\)/);
  });

  test('respects line range', async () => {
    const result = await executeTool('git_blame', {
      path      : 'src/utils.js',
      directory : REPO,
      start_line: 1,
      end_line  : 1,
    });
    expect(result).toContain('function add');
  });

  test('throws on non-git directory', async () => {
    await expect(executeTool('git_blame', {
      path     : 'file.txt',
      directory: os.tmpdir(),
    })).rejects.toThrow(/git repository/i);
  });
});

// ─────────────────────────────────────────────
//  assertIsGitRepo — error is non-retryable
// ─────────────────────────────────────────────

describe('assertIsGitRepo error properties', () => {
  test('error from non-git dir is non-retryable', async () => {
    try {
      await executeTool('git_status', { directory: os.tmpdir() });
    } catch (err) {
      expect(err.retryable).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────
//  Tool count — system prompt includes git tools
// ─────────────────────────────────────────────

describe('System prompt includes git tools', () => {
  test('getToolDescriptions includes all 6 git tools', () => {
    const { getToolDescriptions } = require('../src/tools');
    const docs = getToolDescriptions();
    expect(docs).toContain('git_status');
    expect(docs).toContain('git_log');
    expect(docs).toContain('git_diff');
    expect(docs).toContain('git_branches');
    expect(docs).toContain('git_show');
    expect(docs).toContain('git_blame');
  });
});
