// src/package-manager.js — Smart package manager detection and installation
//
// Supports: npm, yarn, pnpm (JS), pip/pip3 (Python), cargo (Rust), go get (Go)
// Features:
//   - Auto-detects package manager from lockfiles
//   - Checks if package is already installed before running
//   - Validates version syntax before passing to installer
//   - Reads existing versions from package.json / requirements.txt
//   - Returns structured result with what changed
//
'use strict';

const fs           = require('fs');
const path         = require('path');
const { execSync, spawnSync } = require('child_process');

// ─────────────────────────────────────────────
//  Package manager definitions
// ─────────────────────────────────────────────

const MANAGERS = {
  // ── JavaScript ────────────────────────────────────────────────────────────
  npm: {
    detect     : (dir) => hasFile(dir, 'package-lock.json') || hasFile(dir, 'package.json'),
    installCmd : (pkg, version, dev) =>
      `npm install ${dev ? '--save-dev' : '--save'} ${pkg}${version ? '@' + version : ''}`,
    uninstallCmd : (pkg) => `npm uninstall ${pkg}`,
    listCmd    : (dir) => 'npm list --depth=0 --json',
    isInstalled: (pkg, dir) => checkNpmInstalled(pkg, dir),
    getVersion : (pkg, dir) => getNpmVersion(pkg, dir),
    ecosystem  : 'javascript',
  },

  yarn: {
    detect     : (dir) => hasFile(dir, 'yarn.lock'),
    installCmd : (pkg, version, dev) =>
      `yarn add ${dev ? '--dev' : ''} ${pkg}${version ? '@' + version : ''}`,
    uninstallCmd : (pkg) => `yarn remove ${pkg}`,
    listCmd    : (dir) => 'yarn list --depth=0',
    isInstalled: (pkg, dir) => checkNpmInstalled(pkg, dir),
    getVersion : (pkg, dir) => getNpmVersion(pkg, dir),
    ecosystem  : 'javascript',
  },

  pnpm: {
    detect     : (dir) => hasFile(dir, 'pnpm-lock.yaml'),
    installCmd : (pkg, version, dev) =>
      `pnpm add ${dev ? '--save-dev' : ''} ${pkg}${version ? '@' + version : ''}`,
    uninstallCmd : (pkg) => `pnpm remove ${pkg}`,
    listCmd    : (dir) => 'pnpm list --depth=0',
    isInstalled: (pkg, dir) => checkNpmInstalled(pkg, dir),
    getVersion : (pkg, dir) => getNpmVersion(pkg, dir),
    ecosystem  : 'javascript',
  },

  // ── Python ────────────────────────────────────────────────────────────────
  pip: {
    detect     : (dir) => hasFile(dir, 'requirements.txt') || hasFile(dir, 'setup.py') || hasFile(dir, 'pyproject.toml'),
    installCmd : (pkg, version, dev) =>
      `pip install ${pkg}${version ? '==' + version : ''}`,
    uninstallCmd : (pkg) => `pip uninstall -y ${pkg}`,
    listCmd    : (dir) => 'pip list --format=json',
    isInstalled: (pkg, dir) => checkPipInstalled(pkg),
    getVersion : (pkg, dir) => getPipVersion(pkg),
    ecosystem  : 'python',
  },

  // ── Rust ─────────────────────────────────────────────────────────────────
  cargo: {
    detect     : (dir) => hasFile(dir, 'Cargo.toml'),
    installCmd : (pkg, version, dev) =>
      `cargo add ${pkg}${version ? '@' + version : ''}${dev ? ' --dev' : ''}`,
    uninstallCmd : (pkg) => `cargo remove ${pkg}`,
    listCmd    : (dir) => 'cargo metadata --no-deps --format-version 1',
    isInstalled: (pkg, dir) => checkCargoInstalled(pkg, dir),
    getVersion : (pkg, dir) => getCargoVersion(pkg, dir),
    ecosystem  : 'rust',
  },

  // ── Go ────────────────────────────────────────────────────────────────────
  go: {
    detect     : (dir) => hasFile(dir, 'go.mod'),
    installCmd : (pkg, version, dev) =>
      `go get ${pkg}${version ? '@' + version : '@latest'}`,
    uninstallCmd : (pkg) => `go get ${pkg}@none`,
    listCmd    : (dir) => 'go list -m all',
    isInstalled: (pkg, dir) => checkGoInstalled(pkg, dir),
    getVersion : (pkg, dir) => getGoVersion(pkg, dir),
    ecosystem  : 'go',
  },
};

// ─────────────────────────────────────────────
//  Detection helpers
// ─────────────────────────────────────────────

function hasFile(dir, name) {
  return fs.existsSync(path.join(dir, name));
}

function safeExec(cmd, cwd, timeout = 10_000) {
  try {
    return execSync(cmd, {
      cwd, encoding: 'utf8', timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return ''; }
}

// ─────────────────────────────────────────────
//  Per-ecosystem installation checks
// ─────────────────────────────────────────────

function checkNpmInstalled(pkg, dir) {
  try {
    const pkgJson = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgJson)) return false;
    const data = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    return !!(data.dependencies?.[pkg] || data.devDependencies?.[pkg]);
  } catch { return false; }
}

function getNpmVersion(pkg, dir) {
  try {
    const pkgJson = path.join(dir, 'package.json');
    const data    = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    return data.dependencies?.[pkg] || data.devDependencies?.[pkg] || null;
  } catch { return null; }
}

function checkPipInstalled(pkg) {
  const normalised = pkg.toLowerCase().replace(/[-_]/g, '[-_]');
  const out = safeExec(`pip show ${pkg}`, process.cwd());
  return out.includes('Name:');
}

function getPipVersion(pkg) {
  const out = safeExec(`pip show ${pkg}`, process.cwd());
  const m   = out.match(/^Version:\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function checkCargoInstalled(pkg, dir) {
  try {
    const toml = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
    return toml.includes(`${pkg} =`) || toml.includes(`[dependencies.${pkg}]`);
  } catch { return false; }
}

function getCargoVersion(pkg, dir) {
  try {
    const toml  = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
    const match = toml.match(new RegExp(`${pkg}\\s*=\\s*"([^"]+)"`));
    return match ? match[1] : null;
  } catch { return null; }
}

function checkGoInstalled(pkg, dir) {
  const out = safeExec('go list -m all', dir);
  return out.split('\n').some(line => line.startsWith(pkg));
}

function getGoVersion(pkg, dir) {
  const out  = safeExec('go list -m all', dir);
  const line = out.split('\n').find(l => l.startsWith(pkg));
  return line ? line.split(/\s+/)[1] || null : null;
}

// ─────────────────────────────────────────────
//  Version validation
// ─────────────────────────────────────────────

function validateVersion(version, ecosystem) {
  if (!version) return { valid: true };

  // npm semver: ^1.2.3, ~1.2.3, 1.2.3, 1.x, latest, next
  if (ecosystem === 'javascript') {
    const valid = /^[\^~]?\d+(\.\d+)*(-\w+)?$/.test(version) ||
                  /^(latest|next|beta|alpha|rc)$/.test(version) ||
                  /^\d+\.x/.test(version);
    if (!valid) {
      return { valid: false, message: `Invalid npm version: "${version}". Use semver (e.g. 1.2.3, ^1.2.3) or "latest"` };
    }
  }

  // Python: ==1.2.3, >=1.2.3, ~=1.2.3, 1.2.3
  if (ecosystem === 'python') {
    const valid = /^[><=!~]*\d+(\.\d+)*$/.test(version) || /^\d+(\.\d+)*$/.test(version);
    if (!valid) {
      return { valid: false, message: `Invalid pip version: "${version}". Use ==1.2.3, >=1.2.3, or just 1.2.3` };
    }
  }

  return { valid: true };
}

// ─────────────────────────────────────────────
//  Main install function
// ─────────────────────────────────────────────

/**
 * Install a package using the detected or specified package manager.
 *
 * @param {string}   pkg       - Package name (e.g. "express", "requests")
 * @param {string}   dir       - Project directory
 * @param {Object}   opts
 * @param {string}   opts.version    - Specific version to install
 * @param {boolean}  opts.dev        - Install as dev dependency
 * @param {string}   opts.manager    - Force a specific manager
 * @param {boolean}  opts.skipIfInstalled - Skip if already in package.json
 * @param {number}   opts.timeout    - Timeout in ms (default: 120000)
 * @returns {InstallResult}
 */
function installPackage(pkg, dir, opts = {}) {
  const {
    version         = null,
    dev             = false,
    manager         = null,
    skipIfInstalled = true,
    timeout         = 120_000,
  } = opts;

  // ── Detect manager ─────────────────────────────────────────────────────
  let mgr;
  if (manager) {
    mgr = MANAGERS[manager];
    if (!mgr) throw new Error(
      `Unknown package manager: "${manager}". ` +
      `Supported: ${Object.keys(MANAGERS).join(', ')}`
    );
  } else {
    // Try in priority order: pnpm > yarn > npm > pip > cargo > go
    const priority = ['pnpm', 'yarn', 'npm', 'pip', 'cargo', 'go'];
    for (const name of priority) {
      if (MANAGERS[name].detect(dir)) {
        mgr = MANAGERS[name];
        mgr._name = name;
        break;
      }
    }
    if (!mgr) throw new Error(
      'Could not detect a package manager in: ' + dir + '\n' +
      'Create a package.json, requirements.txt, Cargo.toml, or go.mod first.'
    );
  }

  if (!mgr._name) {
    mgr._name = Object.keys(MANAGERS).find(k => MANAGERS[k] === mgr) || 'unknown';
  }

  // ── Validate version ────────────────────────────────────────────────────
  const vCheck = validateVersion(version, mgr.ecosystem);
  if (!vCheck.valid) throw new Error(vCheck.message);

  // ── Check if already installed ──────────────────────────────────────────
  const alreadyInstalled = mgr.isInstalled(pkg, dir);
  const currentVersion   = mgr.getVersion(pkg, dir);

  if (skipIfInstalled && alreadyInstalled && !version) {
    return {
      manager    : mgr._name,
      package    : pkg,
      version    : currentVersion,
      status     : 'already_installed',
      skipped    : true,
      message    : `${pkg} is already installed (${currentVersion || 'version unknown'}). Skipped.`,
      command    : null,
    };
  }

  // ── Build and run install command ────────────────────────────────────────
  const command = mgr.installCmd(pkg, version, dev);

  const proc = spawnSync(command, [], {
    cwd    : dir,
    shell  : true,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env    : { ...process.env },
  });

  const stdout   = (proc.stdout || '').trim();
  const stderr   = (proc.stderr || '').trim();
  const output   = [stdout, stderr].filter(Boolean).join('\n');
  const success  = proc.status === 0;

  if (!success) {
    const errMsg = extractInstallError(output, mgr._name, pkg);
    throw new Error(`Failed to install ${pkg}:\n${errMsg}`);
  }

  // Read new version after install
  const newVersion = mgr.getVersion(pkg, dir);

  return {
    manager    : mgr._name,
    package    : pkg,
    version    : newVersion || version || 'latest',
    dev,
    status     : alreadyInstalled ? 'updated' : 'installed',
    skipped    : false,
    message    : buildSuccessMessage(mgr._name, pkg, newVersion, alreadyInstalled, dev),
    command,
    output     : output.slice(0, 500),
  };
}

// ─────────────────────────────────────────────
//  Batch install
// ─────────────────────────────────────────────

/**
 * Install multiple packages at once.
 * More efficient than calling installPackage() in a loop.
 */
function installPackages(packages, dir, opts = {}) {
  const { dev = false, manager = null, timeout = 180_000 } = opts;

  // Detect manager once
  let mgrName = manager;
  if (!mgrName) {
    const priority = ['pnpm', 'yarn', 'npm', 'pip', 'cargo', 'go'];
    mgrName = priority.find(n => MANAGERS[n].detect(dir));
    if (!mgrName) throw new Error('Could not detect a package manager in: ' + dir);
  }

  const mgr = MANAGERS[mgrName];
  mgr._name = mgrName;

  // Filter already-installed
  const toInstall = packages.filter(pkg => {
    const name = typeof pkg === 'string' ? pkg : pkg.name;
    return !mgr.isInstalled(name, dir);
  });

  if (toInstall.length === 0) {
    return {
      manager : mgrName,
      status  : 'all_already_installed',
      message : `All ${packages.length} package(s) already installed. Nothing to do.`,
      installed: [],
      skipped  : packages.map(p => typeof p === 'string' ? p : p.name),
    };
  }

  // Build batch command
  const pkgArgs = toInstall.map(pkg => {
    const name    = typeof pkg === 'string' ? pkg : pkg.name;
    const version = typeof pkg === 'object' ? pkg.version : null;
    return `${name}${version ? '@' + version : ''}`;
  }).join(' ');

  let batchCmd;
  if (mgrName === 'npm')  batchCmd = `npm install ${dev ? '--save-dev' : '--save'} ${pkgArgs}`;
  if (mgrName === 'yarn') batchCmd = `yarn add ${dev ? '--dev' : ''} ${pkgArgs}`;
  if (mgrName === 'pnpm') batchCmd = `pnpm add ${dev ? '--save-dev' : ''} ${pkgArgs}`;
  if (mgrName === 'pip')  batchCmd = `pip install ${pkgArgs}`;
  if (!batchCmd) {
    // Fallback: install one by one
    const results = [];
    for (const pkg of toInstall) {
      const name    = typeof pkg === 'string' ? pkg : pkg.name;
      const version = typeof pkg === 'object' ? pkg.version : null;
      results.push(installPackage(name, dir, { version, dev, manager: mgrName, timeout }));
    }
    return { manager: mgrName, status: 'installed', installed: results };
  }

  const proc = spawnSync(batchCmd, [], {
    cwd: dir, shell: true, encoding: 'utf8',
    timeout, maxBuffer: 10 * 1024 * 1024,
  });

  if (proc.status !== 0) {
    throw new Error(`Batch install failed:\n${(proc.stderr || proc.stdout || '').slice(0, 500)}`);
  }

  return {
    manager  : mgrName,
    status   : 'installed',
    message  : `Installed ${toInstall.length} package(s) with ${mgrName}`,
    installed: toInstall.map(p => typeof p === 'string' ? p : p.name),
    skipped  : packages
      .map(p => typeof p === 'string' ? p : p.name)
      .filter(n => !toInstall.map(p => typeof p === 'string' ? p : p.name).includes(n)),
    command  : batchCmd,
  };
}

// ─────────────────────────────────────────────
//  Package manager detection
// ─────────────────────────────────────────────

function detectManager(dir) {
  const priority = ['pnpm', 'yarn', 'npm', 'pip', 'cargo', 'go'];
  return priority.find(n => MANAGERS[n].detect(dir)) || null;
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function buildSuccessMessage(manager, pkg, version, wasInstalled, dev) {
  const devStr     = dev ? ' (dev)' : '';
  const versionStr = version ? `@${version}` : '';
  const action     = wasInstalled ? 'Updated' : 'Installed';
  return `✓ ${action} ${pkg}${versionStr}${devStr} using ${manager}`;
}

function extractInstallError(output, manager, pkg) {
  const lines = output.split('\n');

  // npm errors
  const npmError = lines.find(l => l.includes('npm ERR!') || l.includes('error'));
  if (npmError) return npmError.trim();

  // pip errors
  const pipError = lines.find(l => l.includes('ERROR:') || l.includes('No matching distribution'));
  if (pipError) return pipError.trim();

  return output.slice(0, 300);
}

function formatInstallResult(result) {
  if (result.skipped) return result.message;

  const lines = [result.message];
  if (result.installed && result.installed.length > 0) {
    lines.push(`Installed: ${result.installed.join(', ')}`);
  }
  if (result.skipped && result.skipped.length > 0) {
    lines.push(`Already installed: ${result.skipped.join(', ')}`);
  }
  if (result.command) {
    lines.push(`Command: ${result.command}`);
  }
  return lines.join('\n');
}

module.exports = {
  installPackage,
  installPackages,
  detectManager,
  validateVersion,
  formatInstallResult,
  MANAGERS,
  // Export for testing
  checkNpmInstalled,
  getNpmVersion,
  checkPipInstalled,
};
