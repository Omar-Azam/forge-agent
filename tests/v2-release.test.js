// tests/v2-release.test.js — Final v2.0.0 release verification
'use strict';

const fs = require('fs');
const path = require('path');

describe('v2.0.0 Release Verification', () => {
  const root = path.join(__dirname, '..');

  test('package.json version is "2.0.0"', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.version).toBe('2.0.0');
  });

  test('package.json name is "@omar-azam/forge-agent"', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@omar-azam/forge-agent');
  });

  test('package.json bin.forge-agent exists', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.bin['forge-agent']).toBeDefined();
  });

  test('package.json bin.fa exists', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.bin.fa).toBeDefined();
  });

  test('src/index.js contains "Forge Agent"', () => {
    const content = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
    expect(content).toContain('Forge Agent');
  });

  test('CHANGELOG.md contains all version headers', () => {
    const content = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(content).toContain('[2.0.0]');
    expect(content).toContain('[1.4.0]');
    expect(content).toContain('[1.3.0]');
    expect(content).toContain('[1.2.0]');
    expect(content).toContain('[1.1.0]');
    expect(content).toContain('[1.0.0]');
  });

  test('README.md contains key identifiers', () => {
    const content = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    expect(content.toLowerCase()).toContain('forge-agent');
    expect(content).toContain('npm install -g @omar-azam/forge-agent');
    expect(content).toContain('37+');
  });

  test('launch.json metadata is correct', () => {
    const launch = JSON.parse(fs.readFileSync(path.join(root, 'launch.json'), 'utf8'));
    expect(launch.version).toBe('2.0.0');
    expect(launch.stats.daysOfDevelopment).toBe(50);
    expect(launch.links.npm).toBeDefined();
    expect(launch.links.github).toBeDefined();
  });

  test('docs/index.html contains v2.0.0', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
    expect(content).toMatch(/v2\.0\.0|2\.0\.0/);
  });

  test('SUPPORTERS.md exists', () => {
    expect(fs.existsSync(path.join(root, 'SUPPORTERS.md'))).toBe(true);
  });

  test('LICENSE exists', () => {
    expect(fs.existsSync(path.join(root, 'LICENSE'))).toBe(true);
  });

  test('src/diagnostics.js version is updated', () => {
    const content = fs.readFileSync(path.join(root, 'src', 'diagnostics.js'), 'utf8');
    expect(content).toContain("version: '2.0.0'");
  });

  test('docs/css/style.css contains release-banner styles', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'css', 'style.css'), 'utf8');
    expect(content).toContain('.release-banner');
  });

  test('CONTRIBUTING.md exists', () => {
    expect(fs.existsSync(path.join(root, 'CONTRIBUTING.md'))).toBe(true);
  });

  test('SECURITY.md exists', () => {
    expect(fs.existsSync(path.join(root, 'SECURITY.md'))).toBe(true);
  });

  test('ROADMAP.md exists', () => {
    expect(fs.existsSync(path.join(root, 'ROADMAP.md'))).toBe(true);
  });

  test('CODE_OF_CONDUCT.md exists', () => {
    expect(fs.existsSync(path.join(root, 'CODE_OF_CONDUCT.md'))).toBe(true);
  });

  test('Dockerfile exists', () => {
    expect(fs.existsSync(path.join(root, 'Dockerfile'))).toBe(true);
  });

  test('docker-compose.yml exists', () => {
    expect(fs.existsSync(path.join(root, 'docker-compose.yml'))).toBe(true);
  });

  test('Makefile exists', () => {
    expect(fs.existsSync(path.join(root, 'Makefile'))).toBe(true);
  });
});
