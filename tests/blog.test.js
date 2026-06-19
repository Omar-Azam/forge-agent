// tests/blog.test.js — Verify blog files and launch metadata
'use strict';

const fs = require('fs');
const path = require('path');

describe('Blog and Launch Metadata', () => {

  test('docs/blog/ directory exists', () => {
    const dirPath = path.join(__dirname, '..', 'docs', 'blog');
    expect(fs.existsSync(dirPath)).toBe(true);
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
  });

  test('Blog index page exists and has basic content', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'blog', 'index.html');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Forge Agent Blog');
    expect(content).toContain('launch.html');
    expect(content).toContain('roadmap-2026.html');
  });

  test('Launch blog post exists and has content', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'blog', 'launch.html');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Introducing Forge Agent');
    expect(content).toContain('API Key');
    expect(content).toContain('npm install -g @omar-azam/forge-agent');
  });

  test('Roadmap blog post exists and has content', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'blog', 'roadmap-2026.html');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Roadmap');
    expect(content).toContain('v1.5.0');
    expect(content).toContain('v2.0.0');
  });

  test('launch.json exists and is valid', () => {
    const filePath = path.join(__dirname, '..', 'launch.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(data.project).toBe('Forge Agent');
    expect(data.package).toBe('@omar-azam/forge-agent');
    expect(data.stats.daysOfDevelopment).toBe(50);
  });

  test('Main docs index has Latest from the Blog section', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'index.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Latest from the Blog');
    expect(content).toContain('blog/launch.html');
  });

  test('Sidebar in other docs contains Blog link', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'getting-started.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('href="blog/index.html"');
  });
});
