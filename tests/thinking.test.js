// tests/thinking.test.js — R1 thinking mode tests
'use strict';

const {
  detectThinkingMode,
  extractThinking,
  isStillThinking,
  summariseThinking,
  stripAllThinkingBlocks,
  ThinkingTracker
} = require('../src/thinking');
const config = require('../src/config');

describe('Thinking Utilities', () => {

  test('detectThinkingMode returns false for plain text', () => {
    expect(detectThinkingMode('Hello world')).toBe(false);
  });

  test('detectThinkingMode returns true for text with <think> block', () => {
    expect(detectThinkingMode('<think>Working on it</think> Done')).toBe(true);
  });

  test('detectThinkingMode returns true for partial <think> block', () => {
    expect(detectThinkingMode('<think>Working on it')).toBe(true);
  });

  test('detectThinkingMode returns false for empty string', () => {
    expect(detectThinkingMode('')).toBe(false);
  });

  test('extractThinking returns null thinking for plain text', () => {
    const { thinking, response } = extractThinking('Hello world');
    expect(thinking).toBe(null);
    expect(response).toBe('Hello world');
  });

  test('extractThinking returns thinking content from <think> block', () => {
    const { thinking, response } = extractThinking('<think>My thoughts</think> Actual response');
    expect(thinking).toBe('My thoughts');
    expect(response).toBe('Actual response');
  });

  test('extractThinking returns response after </think> tag', () => {
    const { thinking, response } = extractThinking('<think>A</think>B');
    expect(thinking).toBe('A');
    expect(response).toBe('B');
  });

  test('extractThinking handles multiple <think> blocks (takes first)', () => {
    // Current implementation takes first and everything after.
    // stripAllThinkingBlocks handles all for cleaning.
    const { thinking, response } = extractThinking('<think>T1</think> R1 <think>T2</think> R2');
    expect(thinking).toBe('T1');
    expect(response).toBe('R1 <think>T2</think> R2');
  });

  test('extractThinking trims whitespace from response', () => {
    const { response } = extractThinking('<think>T</think>   Res   ');
    expect(response).toBe('Res');
  });

  test('isStillThinking returns true when <think> has no closing tag', () => {
    expect(isStillThinking('<think>I am thinking')).toBe(true);
  });

  test('isStillThinking returns false when <think> is closed', () => {
    expect(isStillThinking('<think>Thought</think>')).toBe(false);
  });

  test('isStillThinking returns false for plain text', () => {
    expect(isStillThinking('Plain text')).toBe(false);
  });

  test('summariseThinking returns empty string for empty input', () => {
    expect(summariseThinking('')).toBe('');
    expect(summariseThinking(null)).toBe('');
  });

  test('summariseThinking returns max N lines', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6';
    const summary = summariseThinking(text, 3);
    const lines = summary.split('\n');
    expect(lines.length).toBe(3);
  });

  test('summariseThinking prefixes lines with 💭', () => {
    const summary = summariseThinking('Thought');
    expect(summary).toContain('💭 Thought');
  });

  test('summariseThinking filters empty lines', () => {
    const summary = summariseThinking('\n\nLine 1\n\nLine 2\n\n');
    expect(summary.split('\n').length).toBe(2);
  });

  test('ThinkingTracker starts with isThinking false', () => {
    const tracker = new ThinkingTracker();
    expect(tracker.isThinking).toBe(false);
  });

  test('ThinkingTracker starts with hasThinking false', () => {
    const tracker = new ThinkingTracker();
    expect(tracker.hasThinking).toBe(false);
  });

  test('ThinkingTracker.update detects mid-thought text', () => {
    const tracker = new ThinkingTracker();
    tracker.update('<think>Thinking...');
    expect(tracker.isThinking).toBe(true);
    expect(tracker.hasThinking).toBe(true);
    expect(tracker.thinkingContent).toBe('Thinking...');
  });

  test('ThinkingTracker.update detects complete thought', () => {
    const tracker = new ThinkingTracker();
    tracker.update('<think>Done thinking</think> Response');
    expect(tracker.isThinking).toBe(false);
    expect(tracker.hasThinking).toBe(true);
    expect(tracker.thinkingContent).toBe('Done thinking');
    expect(tracker.responseContent).toBe('Response');
  });

  test('ThinkingTracker.reset clears all state', () => {
    const tracker = new ThinkingTracker();
    tracker.update('<think>T</think> R');
    tracker.reset();
    expect(tracker.hasThinking).toBe(false);
    expect(tracker.thinkingContent).toBe('');
    expect(tracker.responseContent).toBe('');
  });

  test('ThinkingTracker handles null/empty updates', () => {
    const tracker = new ThinkingTracker();
    tracker.update(null);
    expect(tracker.hasThinking).toBe(false);
  });

  test('stripAllThinkingBlocks removes single block', () => {
    expect(stripAllThinkingBlocks('<think>T</think> R')).toBe('R');
  });

  test('stripAllThinkingBlocks removes multiple blocks', () => {
    expect(stripAllThinkingBlocks('<think>T1</think> R1 <think>T2</think> R2')).toBe('R1  R2');
  });

  test('stripAllThinkingBlocks leaves non-thinking text intact', () => {
    expect(stripAllThinkingBlocks('Hello')).toBe('Hello');
  });

  test('stripAllThinkingBlocks handles empty string', () => {
    expect(stripAllThinkingBlocks('')).toBe('');
    expect(stripAllThinkingBlocks(null)).toBe('');
  });

  test('SHOW_THINKING config default is false', () => {
    expect(config.SHOW_THINKING).toBe(false);
  });
});
