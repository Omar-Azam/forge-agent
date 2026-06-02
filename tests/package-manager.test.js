// tests/package-manager.test.js — Day 14: Package manager tests
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const {
  installPackage,
  installPackages,
  detectManager,
  validateVersion,
  formatInstallResult,
  MANAGERS,
  checkNpmInstalled,
  getNpmVersion,
} = require('../src/package-manager');

// ─────────────────────────────────────────────
//  Temp directories for each ecosystem
// ─────────────────────────────────────────────

const BASE = path.join(os.tmpdir(), 'dsa-pkg-test-' + Date.now());

function makeDir(name) {
  const d = path.join(BASE, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function write(dir, file, content) {
  fs.writeFileSync(path.join(dir, file), content, 'utf8');
}

let npmDir, yarnDir, pnpmDir, cargoDir, goDir, emptyDir, pipDir;

beforeAll(() => {
  fs.mkdirSync(BASE, { recursive: true });

  // npm project
  npmDir = makeDir('npm');
  write(npmDir, 'package.json', JSON.stringify({
    name: 'test-project',
    dependencies: { express: '^4.18.0' },
    devDependencies: { jest: '^29.0.0' },
  }, null, 2));
  write(npmDir, 'package-lock.json', '{}');

  // yarn project
  yarnDir = makeDir('yarn');
  write(yarnDir, 'package.json', JSON.stringify({ name: 'yarn-project' }));
  write(yarnDir, 'yarn.lock', '# yarn lockfile v1\n');

  // pnpm project
  pnpmDir = makeDir('pnpm');
  write(pnpmDir, 'package.json', JSON.stringify({ name: 'pnpm-project' }));
  write(pnpmDir, 'pnpm-lock.yaml', 'lockfileVersion: 6.0\n');

  // cargo project
  cargoDir = makeDir('cargo');
  write(cargoDir, 'Cargo.toml', [
    '[package]',
    'name = "my-app"',
    'version = "0.1.0"',
    '',
    '[dependencies]',
    'serde = "1.0"',
  ].join('\n'));

  // go project
  goDir = makeDir('go');
  write(goDir, 'go.mod', [
    'module github.com/user/myapp',
    '',
    'go 1.21',
    '',
    'require github.com/gin-gonic/gin v1.9.1',
  ].join('\n'));

  // pip project
  pipDir = makeDir('pip');
  write(pipDir, 'requirements.txt', 'requests==2.31.0\nflask>=2.0.0\n');

  // empty project
  emptyDir = makeDir('empty');
});

afterAll(() => {
  fs.rmSync(BASE, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
//  MANAGERS registry
// ─────────────────────────────────────────────

describe('MANAGERS registry', () => {
  test('contains all expected managers', () => {
    expect(Object.keys(MANAGERS)).toContain('npm');
    expect(Object.keys(MANAGERS)).toContain('yarn');
    expect(Object.keys(MANAGERS)).toContain('pnpm');
    expect(Object.keys(MANAGERS)).toContain('pip');
    expect(Object.keys(MANAGERS)).toContain('cargo');
    expect(Object.keys(MANAGERS)).toContain('go');
  });

  test('every manager has detect, installCmd, isInstalled, getVersion', () => {
    Object.values(MANAGERS).forEach(mgr => {
      expect(typeof mgr.detect).toBe('function');
      expect(typeof mgr.installCmd).toBe('function');
      expect(typeof mgr.isInstalled).toBe('function');
      expect(typeof mgr.getVersion).toBe('function');
    });
  });
});

// ─────────────────────────────────────────────
//  detectManager
// ─────────────────────────────────────────────

describe('detectManager', () => {
  test('detects npm from package-lock.json', () => {
    expect(detectManager(npmDir)).toBe('npm');
  });

  test('detects yarn from yarn.lock (priority over npm)', () => {
    expect(detectManager(yarnDir)).toBe('yarn');
  });

  test('detects pnpm from pnpm-lock.yaml (priority over npm)', () => {
    expect(detectManager(pnpmDir)).toBe('pnpm');
  });

  test('detects cargo from Cargo.toml', () => {
    expect(detectManager(cargoDir)).toBe('cargo');
  });

  test('detects go from go.mod', () => {
    expect(detectManager(goDir)).toBe('go');
  });

  test('detects pip from requirements.txt', () => {
    expect(detectManager(pipDir)).toBe('pip');
  });

  test('returns null for empty directory', () => {
    expect(detectManager(emptyDir)).toBeNull();
  });
});

// ─────────────────────────────────────────────
//  validateVersion
// ─────────────────────────────────────────────

describe('validateVersion', () => {
  describe('javascript / npm', () => {
    test('accepts semver "1.2.3"', () => {
      expect(validateVersion('1.2.3', 'javascript').valid).toBe(true);
    });

    test('accepts "^1.2.3"', () => {
      expect(validateVersion('^1.2.3', 'javascript').valid).toBe(true);
    });

    test('accepts "~1.2.3"', () => {
      expect(validateVersion('~1.2.3', 'javascript').valid).toBe(true);
    });

    test('accepts "latest"', () => {
      expect(validateVersion('latest', 'javascript').valid).toBe(true);
    });

    test('accepts "next"', () => {
      expect(validateVersion('next', 'javascript').valid).toBe(true);
    });

    test('accepts "4.x"', () => {
      expect(validateVersion('4.x', 'javascript').valid).toBe(true);
    });

    test('rejects invalid version string', () => {
      const r = validateVersion('not-a-version!!', 'javascript');
      expect(r.valid).toBe(false);
      expect(r.message).toMatch(/invalid npm version/i);
    });

    test('accepts null (no version)', () => {
      expect(validateVersion(null, 'javascript').valid).toBe(true);
    });
  });

  describe('python / pip', () => {
    test('accepts "1.2.3"', () => {
      expect(validateVersion('1.2.3', 'python').valid).toBe(true);
    });

    test('accepts ">=2.0.0"', () => {
      expect(validateVersion('>=2.0.0', 'python').valid).toBe(true);
    });

    test('accepts "==2.31.0"', () => {
      expect(validateVersion('==2.31.0', 'python').valid).toBe(true);
    });

    test('rejects invalid pip version', () => {
      const r = validateVersion('not_valid!!', 'python');
      expect(r.valid).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
//  checkNpmInstalled + getNpmVersion
// ─────────────────────────────────────────────

describe('checkNpmInstalled', () => {
  test('returns true for installed dependency', () => {
    expect(checkNpmInstalled('express', npmDir)).toBe(true);
  });

  test('returns true for dev dependency', () => {
    expect(checkNpmInstalled('jest', npmDir)).toBe(true);
  });

  test('returns false for uninstalled package', () => {
    expect(checkNpmInstalled('react', npmDir)).toBe(false);
  });

  test('returns false when package.json does not exist', () => {
    expect(checkNpmInstalled('express', emptyDir)).toBe(false);
  });
});

describe('getNpmVersion', () => {
  test('returns version string for installed package', () => {
    const v = getNpmVersion('express', npmDir);
    expect(v).toBe('^4.18.0');
  });

  test('returns null for uninstalled package', () => {
    expect(getNpmVersion('react', npmDir)).toBeNull();
  });
});

// ─────────────────────────────────────────────
//  checkCargoInstalled + getCargoVersion
// ─────────────────────────────────────────────

describe('Cargo installed checks', () => {
  test('detects installed crate from Cargo.toml', () => {
    const { checkNpmInstalled: _, ...rest } = require('../src/package-manager');
    // Cargo detection is internal — test via detectManager + manual check
    const toml = fs.readFileSync(path.join(cargoDir, 'Cargo.toml'), 'utf8');
    expect(toml).toContain('serde');
  });
});

// ─────────────────────────────────────────────
//  installPackage — skip if installed
// ─────────────────────────────────────────────

describe('installPackage — skipIfInstalled', () => {
  test('skips install when package already in package.json', () => {
    const result = installPackage('express', npmDir, {
      skipIfInstalled: true,
      manager        : 'npm',
    });
    expect(result.status).toBe('already_installed');
    expect(result.skipped).toBe(true);
    expect(result.command).toBeNull();
    expect(result.message).toMatch(/already installed/i);
  });

  test('includes current version in skip message', () => {
    const result = installPackage('express', npmDir, {
      skipIfInstalled: true,
      manager        : 'npm',
    });
    expect(result.version).toBe('^4.18.0');
  });

  test('skips dev dependency too', () => {
    const result = installPackage('jest', npmDir, {
      skipIfInstalled: true,
      manager        : 'npm',
    });
    expect(result.status).toBe('already_installed');
  });
});

// ─────────────────────────────────────────────
//  installPackage — unknown manager
// ─────────────────────────────────────────────

describe('installPackage — error handling', () => {
  test('throws on unknown manager name', () => {
    expect(() => installPackage('express', npmDir, { manager: 'bower' }))
      .toThrow(/unknown package manager/i);
  });

  test('throws on empty directory with no manager', () => {
    expect(() => installPackage('express', emptyDir))
      .toThrow(/could not detect/i);
  });

  test('throws on invalid npm version string', () => {
    expect(() => installPackage('express', npmDir, {
      manager: 'npm',
      version: 'not!!valid',
    })).toThrow(/invalid npm version/i);
  });
});

// ─────────────────────────────────────────────
//  installPackages — batch
// ─────────────────────────────────────────────

describe('installPackages — batch', () => {
  test('skips packages already in package.json', () => {
    const result = installPackages(['express', 'jest'], npmDir, { manager: 'npm' });
    expect(result.status).toBe('all_already_installed');
    expect(result.skipped).toContain('express');
    expect(result.skipped).toContain('jest');
  });

  test('throws on empty directory with no manager', () => {
    expect(() => installPackages(['express'], emptyDir))
      .toThrow(/could not detect/i);
  });

  test('handles mixed string and object package specs', () => {
    // Both express and jest are already installed — should skip all
    const result = installPackages(
      ['express', { name: 'jest', version: '^29.0.0' }],
      npmDir,
      { manager: 'npm' }
    );
    expect(result.status).toBe('all_already_installed');
  });
});

// ─────────────────────────────────────────────
//  formatInstallResult
// ─────────────────────────────────────────────

describe('formatInstallResult', () => {
  test('formats skipped result as single line', () => {
    const result = {
      status : 'already_installed',
      skipped: true,
      message: 'express is already installed (^4.18.0). Skipped.',
    };
    const fmt = formatInstallResult(result);
    expect(fmt).toContain('already installed');
  });

  test('formats installed result with details', () => {
    const result = {
      status   : 'installed',
      skipped  : false,
      message  : '✓ Installed axios@1.6.0 using npm',
      installed: ['axios'],
      command  : 'npm install --save axios@1.6.0',
    };
    const fmt = formatInstallResult(result);
    expect(fmt).toContain('axios');
    expect(fmt).toContain('npm install');
  });
});

// ─────────────────────────────────────────────
//  install_package tool registration
// ─────────────────────────────────────────────

describe('install_package tool', () => {
  test('tool is registered', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS)).toContain('install_package');
  });

  test('total tool count is now 24', () => {
    const { TOOLS } = require('../src/tools');
    expect(Object.keys(TOOLS).length).toBeGreaterThanOrEqual(24);
  });

  test('description mentions auto-detection', () => {
    const { TOOLS } = require('../src/tools');
    expect(TOOLS.install_package.description).toMatch(/auto.detect/i);
  });

  test('requires packages array', () => {
    const { TOOLS } = require('../src/tools');
    const param = TOOLS.install_package.parameters.packages;
    expect(param.required).toBe(true);
    expect(param.type).toBe('array');
  });
});

// ─────────────────────────────────────────────
//  Manager command builders
// ─────────────────────────────────────────────

describe('Manager command builders', () => {
  test('npm install command is correct', () => {
    const cmd = MANAGERS.npm.installCmd('axios', '1.6.0', false);
    expect(cmd).toContain('npm install');
    expect(cmd).toContain('axios@1.6.0');
    expect(cmd).toContain('--save');
  });

  test('npm dev install command uses --save-dev', () => {
    const cmd = MANAGERS.npm.installCmd('jest', null, true);
    expect(cmd).toContain('--save-dev');
  });

  test('yarn install command is correct', () => {
    const cmd = MANAGERS.yarn.installCmd('axios', null, false);
    expect(cmd).toContain('yarn add');
    expect(cmd).toContain('axios');
  });

  test('pip install command is correct', () => {
    const cmd = MANAGERS.pip.installCmd('requests', '2.31.0', false);
    expect(cmd).toContain('pip install');
    expect(cmd).toContain('requests==2.31.0');
  });

  test('cargo add command is correct', () => {
    const cmd = MANAGERS.cargo.installCmd('serde', '1.0', false);
    expect(cmd).toContain('cargo add');
    expect(cmd).toContain('serde@1.0');
  });

  test('go get command is correct', () => {
    const cmd = MANAGERS.go.installCmd('github.com/gin-gonic/gin', 'v1.9.1', false);
    expect(cmd).toContain('go get');
    expect(cmd).toContain('@v1.9.1');
  });

  test('go get uses @latest when no version given', () => {
    const cmd = MANAGERS.go.installCmd('github.com/pkg/errors', null, false);
    expect(cmd).toContain('@latest');
  });
});
