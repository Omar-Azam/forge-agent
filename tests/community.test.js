// tests/community.test.js — Verify existence and content of community health files
'use strict';

const fs = require('fs');
const path = require('path');

describe('Community Health Files', () => {

  const rootFiles = [
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'ROADMAP.md',
    'SUPPORTERS.md'
  ];

  rootFiles.forEach(file => {
    test(`${file} exists in project root`, () => {
      expect(fs.existsSync(path.join(__dirname, '..', file))).toBe(true);
    });
  });

  test('CONTRIBUTING.md contains development setup instructions', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'CONTRIBUTING.md'), 'utf8');
    expect(content).toContain('npm test');
    expect(content).toContain('git checkout -b');
    expect(content).toContain('Adding a New Tool');
  });

  test('CODE_OF_CONDUCT.md contains standard pledge', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'CODE_OF_CONDUCT.md'), 'utf8');
    expect(content).toContain('Contributor Covenant');
    expect(content).toContain('harassment-free experience');
  });

  test('SECURITY.md contains reporting instructions', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'SECURITY.md'), 'utf8');
    expect(content).toContain('Supported Versions');
    expect(content).toContain('Reporting a Vulnerability');
    expect(content).toContain('GitHub Security Advisory');
  });

  test('ROADMAP.md contains future versions', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'ROADMAP.md'), 'utf8');
    expect(content).toContain('v1.5.0');
    expect(content).toContain('v2.0.0');
  });

  test('SUPPORTERS.md contains sponsorship information', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', 'SUPPORTERS.md'), 'utf8');
    expect(content).toContain('Supporters & Sponsors');
    expect(content).toContain('github.com/sponsors');
  });

  test('.github/FUNDING.yml exists and contains required keys', () => {
    const filePath = path.join(__dirname, '..', '.github', 'FUNDING.yml');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('github:');
    expect(content).toContain('open_collective:');
  });

  test('docs/sponsor.html exists and contains sponsorship options', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'sponsor.html');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Support Forge Agent');
    expect(content).toContain('GitHub Sponsors');
    expect(content).toContain('Coffee');
  });

});

describe('GitHub Templates', () => {

  const issueTemplates = [
    'bug_report.yml',
    'feature_request.yml',
    'plugin_share.yml',
    'config.yml'
  ];

  issueTemplates.forEach(file => {
    test(`ISSUE_TEMPLATE/${file} exists`, () => {
      expect(fs.existsSync(path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE', file))).toBe(true);
    });
  });

  test('PULL_REQUEST_TEMPLATE.md contains required checklists', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
    expect(content).toContain('npm test');
    expect(content).toContain('For new tools');
    expect(content).toContain('Documentation');
  });

  test('DISCUSSIONS.md contains category descriptions', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '.github', 'DISCUSSIONS.md'), 'utf8');
    expect(content).toContain('Categories');
    expect(content).toContain('Show and Tell');
  });

});
