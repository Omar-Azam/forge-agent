// tests/manpage.test.js — Test suite for Forge Agent man page generator
'use strict';

const { generateManPage, generateInstallInstructions } = require('../src/manpage');

describe('Man Page Generator', () => {
  
  test('generateManPage returns a non-empty string', () => {
    const output = generateManPage();
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  test('generateManPage output starts with .TH', () => {
    const output = generateManPage();
    expect(output.startsWith('.TH')).toBe(true);
  });

  const sections = [
    '.SH NAME',
    '.SH SYNOPSIS',
    '.SH DESCRIPTION',
    '.SH OPTIONS',
    '.SH EXAMPLES',
    '.SH FILES'
  ];

  sections.forEach(section => {
    test(`generateManPage output contains ${section} section`, () => {
      expect(generateManPage()).toContain(section);
    });
  });

  test("generateManPage output contains 'forge' command name", () => {
    expect(generateManPage()).toContain('forge');
  });

  test("generateManPage output contains '--interactive' flag", () => {
    expect(generateManPage()).toContain('--interactive');
  });

  test("generateInstallInstructions returns string containing 'man forge'", () => {
    const output = generateInstallInstructions();
    expect(output).toContain('man forge');
    expect(output).toContain('sudo mandb');
  });
});
