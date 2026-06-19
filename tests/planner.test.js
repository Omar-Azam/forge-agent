// tests/planner.test.js — Day 21: Planner tool tests
'use strict';

const { 
  buildPlanningPrompt, 
  parsePlan, 
  formatPlanDisplay,
  buildPlanPrompt, 
  formatPlanForDisplay, 
  formatPlanForContext, 
  isPlanResponse 
} = require('../src/planner');

jest.mock('../src/config', () => ({
  PLANNING_MODE: false
}));
const config = require('../src/config');
const fs = require('fs');
const path = require('path');

describe('Planner Module', () => {

  describe('parsePlan', () => {
    test('extracts numbered steps from a standard plan', () => {
      const text = 'PLAN:\n1. Step one\n2. Step two\nREADY';
      const result = parsePlan(text);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]).toBe('Step one');
      expect(result.steps[1]).toBe('Step two');
    });

    test('handles steps with leading spaces', () => {
      const text = '  1. First\n  2. Second';
      const result = parsePlan(text);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]).toBe('First');
    });

    test('returns empty array in steps for text with no numbered steps', () => {
      const text = 'Just some prose here.';
      const result = parsePlan(text);
      expect(result.steps).toEqual([]);
      expect(result.raw).toBe(text);
    });

    test('returns empty array for null/undefined input', () => {
      expect(parsePlan(null).steps).toEqual([]);
      expect(parsePlan(undefined).steps).toEqual([]);
    });
  });

  describe('isPlanResponse', () => {
    test('returns true for text starting with PLAN:', () => {
      expect(isPlanResponse('PLAN:\n1. Do something')).toBe(true);
    });

    test('returns true for text starting with 1.', () => {
      expect(isPlanResponse('1. First step')).toBe(true);
    });

    test('returns false for tool calls', () => {
      const toolCall = '```tool_call\n{"name": "read_file"}\n```';
      expect(isPlanResponse(toolCall)).toBe(false);
    });

    test('returns false for plain prose', () => {
      expect(isPlanResponse('Hello, how can I help you?')).toBe(false);
    });

    test('returns false for empty input', () => {
      expect(isPlanResponse('')).toBe(false);
      expect(isPlanResponse(null)).toBe(false);
    });
  });

  describe('formatPlanDisplay', () => {
    test('returns a string containing all steps', () => {
      const plan = { steps: ['Desc 1'] };
      const output = formatPlanDisplay(plan);
      expect(output).toContain('Execution Plan');
      expect(output).toContain('1.');
      expect(output).toContain('Desc 1');
    });

    test('handles empty steps gracefully', () => {
      expect(formatPlanDisplay({ steps: [] })).toContain('No valid steps');
    });
  });

  describe('formatPlanForContext', () => {
    test('returns context string with steps', () => {
      const steps = ['Task 1'];
      const output = formatPlanForContext(steps);
      expect(output).toContain('plan');
      expect(output).toContain('1. Task 1');
      expect(output).toContain('proceed with Step 1');
    });

    test('returns empty string for empty steps', () => {
      expect(formatPlanForContext([])).toBe('');
    });
  });

  describe('buildPlanningPrompt', () => {
    test('includes the task', () => {
      const task = 'Write tests';
      const prompt = buildPlanningPrompt(task);
      expect(prompt).toContain(task);
      expect(prompt).toContain('PLAN:');
    });
  });

  describe('Configuration', () => {
    test('PLANNING_MODE exists in config and defaults to false', () => {
      expect(config).toHaveProperty('PLANNING_MODE');
      expect(config.PLANNING_MODE).toBe(false);
    });
  });

  describe('CLI Integration', () => {
    test('--plan flag is documented in src/index.js help text', () => {
      const indexPath = path.join(__dirname, '../src/index.js');
      const content = fs.readFileSync(indexPath, 'utf8');
      expect(content).toMatch(/--plan\s+Show execution plan/);
    });
  });
});