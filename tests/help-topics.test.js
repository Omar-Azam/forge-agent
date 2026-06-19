// tests/help-topics.test.js — Test suite for Forge Agent help topics
'use strict';

const { TOPICS } = require('../src/help-topics');

describe('Help Topics System', () => {
  
  test('TOPICS object exists and is exported from src/help-topics.js', () => {
    expect(typeof TOPICS).toBe('object');
  });

  const requiredTopics = [
    'getting-started',
    'profiles',
    'templates',
    'plugins',
    'watch',
    'performance',
    'security',
    'models',
    'resume'
  ];

  requiredTopics.forEach(topic => {
    test(`TOPICS has '${topic}' key`, () => {
      expect(TOPICS).toHaveProperty(topic);
    });

    test(`Topic '${topic}' value is a function`, () => {
      expect(typeof TOPICS[topic]).toBe('function');
    });

    test(`Topic '${topic}' returns a non-empty string when called`, () => {
      const output = TOPICS[topic]();
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  test("'getting-started' topic contains 'forge-agent --setup'", () => {
    expect(TOPICS['getting-started']()).toContain('forge-agent --setup');
  });

  test("'profiles' topic contains 'backend'", () => {
    expect(TOPICS['profiles']()).toContain('backend');
  });

  test("'templates' topic contains 'add-typescript'", () => {
    expect(TOPICS['templates']()).toContain('add-typescript');
  });

  test("'plugins' topic contains 'module.exports'", () => {
    expect(TOPICS['plugins']()).toContain('module.exports');
  });

  test("'security' topic contains 'SSH'", () => {
    expect(TOPICS['security']()).toContain('SSH');
  });

  test("'models' topic contains 'deepseek'", () => {
    expect(TOPICS['models']()).toContain('deepseek');
  });

  test("'resume' topic contains '--resume'", () => {
    expect(TOPICS['resume']()).toContain('--resume');
  });

  test("'performance' topic contains '--no-timeout'", () => {
    expect(TOPICS['performance']()).toContain('--no-timeout');
  });
});
