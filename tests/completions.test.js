// tests/completions.test.js — Test suite for Forge Agent Shell Completions
'use strict';

const { 
  ALL_FLAGS, 
  generateBashCompletion, 
  generateZshCompletion, 
  generateFishCompletion, 
  getInstallInstructions 
} = require('../src/completions');

describe('Shell Completions', () => {

  test('ALL_FLAGS contains at least 40 flag definitions', () => {
    expect(ALL_FLAGS.length).toBeGreaterThanOrEqual(40);
  });

  test('Every entry in ALL_FLAGS has flag, description, and takesValue fields', () => {
    ALL_FLAGS.forEach(f => {
      expect(f).toHaveProperty('flag');
      expect(f).toHaveProperty('description');
      expect(f).toHaveProperty('takesValue');
    });
  });

  test('ALL_FLAGS flag names all start with --', () => {
    ALL_FLAGS.forEach(f => {
      expect(f.flag.startsWith('--')).toBe(true);
    });
  });

  test('ALL_FLAGS has no duplicate flag names', () => {
    const flags = ALL_FLAGS.map(f => f.flag);
    const uniqueFlags = new Set(flags);
    expect(uniqueFlags.size).toBe(flags.length);
  });

  test('Flags with values have valueHint field', () => {
    ALL_FLAGS.filter(f => f.takesValue).forEach(f => {
      expect(f).toHaveProperty('valueHint');
    });
  });

  test('Flags with fixed choices have non-empty values array', () => {
    ALL_FLAGS.filter(f => f.values).forEach(f => {
      expect(Array.isArray(f.values)).toBe(true);
      expect(f.values.length).toBeGreaterThan(0);
    });
  });

  test('--model flag has expected values', () => {
    const model = ALL_FLAGS.find(f => f.flag === '--model');
    expect(model.values).toEqual(['deepseek', 'chatgpt', 'gemini']);
  });

  test('--profile flag has expected values', () => {
    const profile = ALL_FLAGS.find(f => f.flag === '--profile');
    expect(profile.values).toContain('backend');
    expect(profile.values).toContain('frontend');
  });

  test('--format flag has expected values', () => {
    const format = ALL_FLAGS.find(f => f.flag === '--format');
    expect(format.values).toContain('json');
    expect(format.values).toContain('markdown');
  });

  test('generateBashCompletion returns a non-empty string', () => {
    expect(generateBashCompletion().length).toBeGreaterThan(0);
  });

  test('generateBashCompletion output contains _forge_completions', () => {
    expect(generateBashCompletion()).toContain('_forge_completions');
  });

  test('generateBashCompletion output registers completion for forge and fa', () => {
    const script = generateBashCompletion();
    expect(script).toContain('complete -F _forge_completions forge');
    expect(script).toContain('complete -F _forge_completions fa');
  });

  test('generateBashCompletion output contains --model completion case', () => {
    expect(generateBashCompletion()).toContain('--model');
    expect(generateBashCompletion()).toContain('compgen -W "deepseek chatgpt gemini"');
  });

  test('generateZshCompletion returns a non-empty string', () => {
    expect(generateZshCompletion().length).toBeGreaterThan(0);
  });

  test('generateZshCompletion output starts with #compdef forge-agent fa', () => {
    expect(generateZshCompletion().trim().startsWith('#compdef forge-agent fa')).toBe(true);
  });

  test('generateZshCompletion output contains --model', () => {
    expect(generateZshCompletion()).toContain('--model');
    expect(generateZshCompletion()).toContain('deepseek chatgpt gemini');
  });

  test('generateFishCompletion returns a non-empty string', () => {
    expect(generateFishCompletion().length).toBeGreaterThan(0);
  });

  test('generateFishCompletion output contains complete -c forge/fa', () => {
    expect(generateFishCompletion()).toContain('complete -c forge');
    expect(generateFishCompletion()).toContain('complete -c fa');
  });

  test('generateFishCompletion output contains model values', () => {
    expect(generateFishCompletion()).toContain('deepseek chatgpt gemini');
  });

  test('getInstallInstructions(bash) contains source', () => {
    expect(getInstallInstructions('bash')).toContain('source');
  });

  test('getInstallInstructions(zsh) contains .zshrc', () => {
    expect(getInstallInstructions('zsh')).toContain('.zshrc');
  });

  test('getInstallInstructions(fish) contains fish/completions', () => {
    expect(getInstallInstructions('fish')).toContain('fish/completions');
  });
});
