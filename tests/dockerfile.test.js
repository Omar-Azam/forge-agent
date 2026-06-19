// tests/dockerfile.test.js — Verify Docker infrastructure files
'use strict';

const fs = require('fs');
const path = require('path');

describe('Docker Infrastructure Files', () => {

  test('Dockerfile exists and contains expected content', () => {
    const filePath = path.join(__dirname, '..', 'Dockerfile');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('FROM node:20-slim');
    expect(content).toContain('ENTRYPOINT');
    expect(content).toContain('WORKDIR /workspace');
    // Multi-stage indicators
    const fromMatches = content.match(/^FROM /gm);
    expect(fromMatches.length).toBeGreaterThan(1);
  });

  test('.dockerignore exists and contains expected content', () => {
    const filePath = path.join(__dirname, '..', '.dockerignore');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('node_modules');
    expect(content).toContain('tests/');
  });

  test('docker-compose.yml exists and contains expected content', () => {
    const filePath = path.join(__dirname, '..', 'docker-compose.yml');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('forge-agent');
    expect(content).toContain('/workspace');
    expect(content).toContain('network_mode: host');
  });

  test('Makefile exists and contains expected targets', () => {
    const filePath = path.join(__dirname, '..', 'Makefile');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('build:');
    expect(content).toContain('interactive:');
    expect(content).toContain('run:');
  });

  test('.github/workflows/docker.yml exists and contains expected content', () => {
    const filePath = path.join(__dirname, '..', '.github', 'workflows', 'docker.yml');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('ghcr.io');
    expect(content).toContain('linux/amd64');
    expect(content).toContain('linux/arm64');
  });

  test('docs/docker.html exists and contains expected content', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'docker.html');
    expect(fs.existsSync(filePath)).toBe(true);
    
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('docker pull');
    expect(content).toContain('--network host');
    expect(content).toContain('Persistent Sessions');
  });

  test('Sidebar in other docs contains Docker link', () => {
    const filePath = path.join(__dirname, '..', 'docs', 'index.html');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('href="docker.html"');
  });
});
