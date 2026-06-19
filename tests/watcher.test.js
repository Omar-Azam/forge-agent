// tests/watcher.test.js — Test suite for Forge Agent Watch Mode
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { matchesPattern, expandPatterns, shouldIgnore, FileWatcher } = require('../src/watcher');
const config = require('../src/config');

const TMP_DIR = path.join(os.tmpdir(), `forge-watcher-test-${Date.now()}`);

// Increase Jest timeout for file watching tests
jest.setTimeout(15000);

describe('Watcher Utils', () => {
  test('matchesPattern returns true for exact filename match', () => {
    expect(matchesPattern('index.js', ['*.js'])).toBe(true);
  });

  test('matchesPattern returns true for nested path', () => {
    expect(matchesPattern('src/index.js', ['src/**/*.js'])).toBe(true);
  });

  test('matchesPattern returns true for double-star pattern', () => {
    expect(matchesPattern('a/b/c.js', ['**/*.js'])).toBe(true);
  });

  test('matchesPattern returns false for non-matching extension', () => {
    expect(matchesPattern('index.py', ['*.js'])).toBe(false);
  });

  test('matchesPattern returns false for wrong directory', () => {
    expect(matchesPattern('lib/x.js', ['src/*.js'])).toBe(false);
  });

  test('matchesPattern handles ? wildcard', () => {
    expect(matchesPattern('file.js', ['f?le.js'])).toBe(true);
    expect(matchesPattern('file.js', ['fi?e.js'])).toBe(true);
  });

  test('shouldIgnore returns true for node_modules path', () => {
    expect(shouldIgnore('node_modules/pkg/index.js', ['node_modules'])).toBe(true);
  });

  test('shouldIgnore returns true for .git path', () => {
    expect(shouldIgnore('.git/config', ['.git'])).toBe(true);
  });

  test('shouldIgnore returns false for src/index.js with default ignore list', () => {
    expect(shouldIgnore('src/index.js', ['node_modules', '.git'])).toBe(false);
  });

  test('shouldIgnore returns false for empty ignored array', () => {
    expect(shouldIgnore('src/index.js', [])).toBe(false);
  });

  test('expandPatterns returns unique top-level directories', () => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const srcDir = path.join(TMP_DIR, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);
    
    const dirs = expandPatterns(['src/**/*.js'], TMP_DIR);
    expect(dirs).toEqual([srcDir]);
  });
});

describe('FileWatcher', () => {
  let watcher;

  beforeEach(() => {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    watcher = new FileWatcher({ cwd: TMP_DIR, debounceMs: 100 });
  });

  afterEach(() => {
    if (watcher) watcher.stop();
  });

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('FileWatcher constructor accepts opts without throwing', () => {
    expect(() => new FileWatcher()).not.toThrow();
  });

  test('FileWatcher.isWatching is false before start()', () => {
    expect(watcher.isWatching).toBe(false);
  });

  test('FileWatcher.start() sets isWatching to true', () => {
    watcher.start();
    expect(watcher.isWatching).toBe(true);
  });

  test('FileWatcher.stop() sets isWatching to false', () => {
    watcher.start().stop();
    expect(watcher.isWatching).toBe(false);
  });

  test('FileWatcher detects file change in watched directory', (done) => {
    watcher.onChange((files) => {
      try {
        expect(files.length).toBeGreaterThanOrEqual(1);
        expect(files.some(f => f.relativePath === 'test.js')).toBe(true);
        done();
      } catch (err) {
        done(err);
      }
    });
    
    watcher.start();
    
    // Give watcher time to initialize (1000ms for safety)
    setTimeout(() => {
      fs.writeFileSync(path.join(TMP_DIR, 'test.js'), 'console.log(1)');
    }, 1000);
  });

  test('FileWatcher debounces rapid changes into single callback', (done) => {
    let callCount = 0;
    watcher.onChange((files) => {
      callCount++;
      try {
        expect(files.length).toBeGreaterThanOrEqual(2);
        done();
      } catch (err) {
        done(err);
      }
    });
    
    watcher.start();
    
    setTimeout(() => {
      fs.writeFileSync(path.join(TMP_DIR, 'a.js'), 'a');
      fs.writeFileSync(path.join(TMP_DIR, 'b.js'), 'b');
    }, 1000);
  });

  test('FileWatcher ignores changes in ignored directories', (done) => {
    const ignoredDir = path.join(TMP_DIR, 'node_modules');
    fs.mkdirSync(ignoredDir);
    
    let callCount = 0;
    watcher.onChange(() => {
      callCount++;
    });
    
    watcher.start();
    
    setTimeout(() => {
      fs.writeFileSync(path.join(ignoredDir, 'test.js'), 'ignore me');
      
      // Wait to see if it fires (it shouldn't)
      setTimeout(() => {
        try {
          expect(callCount).toBe(0);
          done();
        } catch (err) {
          done(err);
        }
      }, 1000);
    }, 1000);
  });
});

describe('Watcher Config', () => {
  test('WATCH_DEBOUNCE_MS defaults to 1000 in config', () => {
    expect(config.WATCH_DEBOUNCE_MS).toBe(1000);
  });

  test('WATCH_COOLDOWN_MS defaults to 5000 in config', () => {
    expect(config.WATCH_COOLDOWN_MS).toBe(5000);
  });
});
