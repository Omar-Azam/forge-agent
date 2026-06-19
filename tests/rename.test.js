'use strict';

const fs = require('fs');
const path = require('path');

describe('Package and Command Rename Verification', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const postinstall = fs.readFileSync(path.join(__dirname, '../src/postinstall.js'), 'utf8');
  const launch = JSON.parse(fs.readFileSync(path.join(__dirname, '../launch.json'), 'utf8'));
  const contributing = fs.readFileSync(path.join(__dirname, '../CONTRIBUTING.md'), 'utf8');
  const changelog = fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8');

  test('package.json name is correct', () => {
    expect(pkg.name).toBe('@omar-azam/forge-agent');
  });

  test('package.json bin has forge-agent', () => {
    expect(pkg.bin['forge-agent']).toBe('src/index.js');
  });

  test('package.json bin does NOT have forge', () => {
    expect(pkg.bin['forge']).toBeUndefined();
  });

  test('package.json bin fa points to src/index.js', () => {
    expect(pkg.bin['fa']).toBe('src/index.js');
  });

  test('package.json publishConfig.access is public', () => {
    expect(pkg.publishConfig.access).toBe('public');
  });

  test('package.json repository URL is correct', () => {
    expect(pkg.repository.url).toContain('github.com/Omar-Azam/forge-agent');
  });

  test('README.md contains correct install command', () => {
    expect(readme).toContain('npm install -g @omar-azam/forge-agent');
  });

  test('README.md contains forge-agent --interactive', () => {
    expect(readme).toContain('forge-agent --interactive');
  });

  test('README.md does not contain npm install -g forge-agent without @scope', () => {
    expect(readme).not.toMatch(/npm install -g forge-agent($|\s)/);
  });

  test('README.md contains fa alias example', () => {
    expect(readme).toContain('fa "add TypeScript to this project"');
  });

  test('src/index.js contains forge-agent in help text', () => {
    expect(index).toContain('forge-agent [OPTIONS] [TASK]');
  });

  test('src/index.js does not contain dsa in user-visible strings', () => {
    // Checking for patterns that would appear in help or output
    expect(index).not.toContain('dsa ');
    expect(index).not.toContain('"dsa"');
  });

  test('src/postinstall.js contains forge-agent', () => {
    expect(postinstall).toContain('forge-agent --setup');
  });

  test('src/postinstall.js does not contain dsa or "  forge "', () => {
    expect(postinstall).not.toContain('dsa');
    expect(postinstall).not.toMatch(/^\s+forge /m);
  });

  test('launch.json package is correct', () => {
    expect(launch.package).toBe('@omar-azam/forge-agent');
  });

  test('CONTRIBUTING.md contains forge-agent', () => {
    expect(contributing).toContain('forge-agent');
  });

  test('CONTRIBUTING.md contains scoped package name', () => {
    expect(contributing).toContain('@omar-azam/forge-agent');
  });

  test('CHANGELOG.md contains scoped package name', () => {
    expect(changelog).toContain('@omar-azam/forge-agent');
  });

  test('CHANGELOG.md notes the command rename', () => {
    expect(changelog).toContain('CLI command renamed from `forge` to `forge-agent`');
  });

  test('src/config.js handles forge-agent.config.json', () => {
    const configContent = fs.readFileSync(path.join(__dirname, '../src/config.js'), 'utf8');
    expect(configContent).toContain('forge-agent.config.json');
    expect(configContent).toContain('deepseek-agent.config.json'); // backward compat
  });
});
