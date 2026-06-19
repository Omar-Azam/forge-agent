'use strict';

const { 
  buildSystemPrompt, 
  buildToolDocumentation, 
  buildToolResultMessage, 
  buildPlanningPrompt 
} = require('../src/system-prompt');

describe('system-prompt module', () => {

  test('buildSystemPrompt returns non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildSystemPrompt contains working directory', () => {
    const wd = '/test/dir';
    const prompt = buildSystemPrompt({ workingDir: wd });
    expect(prompt).toContain(wd);
  });

  test('buildSystemPrompt contains TOOL CALL FORMAT section', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('HOW TO USE TOOLS');
  });

  test('buildSystemPrompt contains tool_call format', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('<tool_call>');
    expect(prompt).toContain('</tool_call>');
  });

  test('buildSystemPrompt contains TASK_COMPLETE instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('TASK_COMPLETE');
  });

  test('buildSystemPrompt with planMode shows PLANNING MODE section', () => {
    const prompt = buildSystemPrompt({ planMode: true });
    expect(prompt).toContain('PLANNING MODE ACTIVE');
    expect(prompt).toContain('PLAN:');
  });

  test('buildSystemPrompt with profile shows profile instructions', () => {
    const prompt = buildSystemPrompt({ profile: 'backend' });
    expect(prompt).toContain('ACTIVE PROFILE: BACKEND');
    expect(prompt).toContain('REST APIs');
  });

  test('buildSystemPrompt with projectContext includes context in output', () => {
    const ctx = 'This is project context';
    const prompt = buildSystemPrompt({ projectContext: ctx });
    expect(prompt).toContain(ctx);
  });

  test('buildToolDocumentation returns non-empty string', () => {
    const docs = buildToolDocumentation();
    expect(typeof docs).toBe('string');
    expect(docs.length).toBeGreaterThan(0);
  });

  test('buildToolDocumentation contains write_file', () => {
    const docs = buildToolDocumentation();
    expect(docs).toContain('write_file');
  });

  test('buildToolDocumentation contains run_command', () => {
    const docs = buildToolDocumentation();
    expect(docs).toContain('run_command');
  });

  test('buildToolResultMessage formats success correctly', () => {
    const msg = buildToolResultMessage('test_tool', 'result content', false);
    expect(msg).toContain('RESULT: test_tool');
    expect(msg).toContain('✅');
    expect(msg).toContain('result content');
  });

  test('buildToolResultMessage formats error correctly', () => {
    const msg = buildToolResultMessage('test_tool', 'error content', true);
    expect(msg).toContain('ERROR: test_tool');
    expect(msg).toContain('❌');
    expect(msg).toContain('error content');
  });

  test('buildPlanningPrompt returns string containing the task', () => {
    const task = 'Fix the bug';
    const prompt = buildPlanningPrompt(task);
    expect(prompt).toContain(task);
  });

  test('buildPlanningPrompt contains PLAN: keyword', () => {
    const prompt = buildPlanningPrompt('task');
    expect(prompt).toContain('PLAN:');
  });

});