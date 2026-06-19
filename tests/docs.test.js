// tests/docs.test.js — Verify documentation structure and basic content
'use strict';

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs');

describe('Documentation Site', () => {
  const pages = [
    'index.html',
    'getting-started.html',
    'tools.html',
    'cli-reference.html',
    'profiles.html',
    'templates.html',
    'plugins.html',
    'configuration.html',
    'examples.html'
  ];

  test('docs directory exists', () => {
    expect(fs.existsSync(DOCS_DIR)).toBe(true);
  });

  pages.forEach(page => {
    const filePath = path.join(DOCS_DIR, page);
    
    test(`docs/${page} exists`, () => {
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test(`docs/${page} has basic HTML structure`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html lang="en">');
      expect(content).toContain('css/style.css');
      expect(content).toContain('js/nav.js');
    });

    test(`docs/${page} contains shared navigation`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('🚀 Getting Started');
      expect(content).toContain('📖 Reference');
      expect(content).toContain('🎭 Features');
      expect(content).toContain('💡 Examples');
    });
  });

  test('docs/css/style.css exists and has theme variables', () => {
    const cssPath = path.join(DOCS_DIR, 'css', 'style.css');
    expect(fs.existsSync(cssPath)).toBe(true);
    const content = fs.readFileSync(cssPath, 'utf8');
    expect(content).toContain('--bg-color');
    expect(content).toContain('--accent-color');
  });

  test('docs/js/nav.js exists and has essential logic', () => {
    const jsPath = path.join(DOCS_DIR, 'js', 'nav.js');
    expect(fs.existsSync(jsPath)).toBe(true);
    const content = fs.readFileSync(jsPath, 'utf8');
    expect(content).toContain('Copy');
    expect(content).toContain('DOMContentLoaded');
  });

  test('GitHub Pages setup files exist', () => {
    expect(fs.existsSync(path.join(DOCS_DIR, '.nojekyll'))).toBe(true);
    expect(fs.existsSync(path.join(DOCS_DIR, '_config.yml'))).toBe(true);
  });

  test('index.html has landing page content', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
    expect(content).toContain('Forge Agent');
    expect(content).toContain('npm install -g @omar-azam/forge-agent');
  });

  test('tools.html documents key tools', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'tools.html'), 'utf8');
    expect(content).toContain('write_file');
    expect(content).toContain('run_command');
    expect(content).toContain('git_status');
  });

  test('cli-reference.html documents key flags', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'cli-reference.html'), 'utf8');
    expect(content).toContain('--interactive');
    expect(content).toContain('--profile');
  });

  test('profiles.html documents backend and data-science', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'profiles.html'), 'utf8');
    expect(content).toContain('backend');
    expect(content).toContain('data-science');
  });

  test('templates.html documents add-typescript and add-docker', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'templates.html'), 'utf8');
    expect(content).toContain('add-typescript');
    expect(content).toContain('add-docker');
  });

  test('plugins.html documents module.exports', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'plugins.html'), 'utf8');
    expect(content).toContain('module.exports');
  });

  test('configuration.html documents RESPONSE_TIMEOUT', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'configuration.html'), 'utf8');
    expect(content).toContain('RESPONSE_TIMEOUT');
  });

  test('examples.html has gallery structure', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'examples.html'), 'utf8');
    expect(content).toContain('example-card');
    expect(content).toContain('Copy Command');
    expect(content).toContain('View Full Prompt');
    expect(content).toContain('filter-bar');
  });

  test('examples.html contains all 10 example IDs', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'examples.html'), 'utf8');
    const ids = [
      'express-rest-api', 'react-todo-app', 'python-cli-tool',
      'nextjs-blog', 'docker-compose-stack', 'data-analysis-notebook',
      'github-actions-ci', 'fastapi-backend', 'vue-dashboard', 'cli-game'
    ];
    ids.forEach(id => expect(content).toContain(id));
  });

  test('index.html contains popular examples section', () => {
    const content = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
    expect(content).toContain('popular-examples');
    expect(content).toContain('Popular Example Projects');
    expect(content).toContain('View All 10 Examples');
  });
});
