// tests/health.test.js — Simplified Health Check Unit Tests
'use strict';

const { runHealthCheck, STATUS } = require('../src/health');

describe('Health Module (Simplified)', () => {
  const mockPage = {
    url: jest.fn().mockReturnValue('https://chat.deepseek.com'),
    $: jest.fn().mockResolvedValue({ isVisible: () => true }),
  };
  const mockAdapter = {
    _getInputSelectors: () => ['textarea'],
    getModelUrl: () => 'https://chat.deepseek.com',
  };
  const mockConfig = {};

  test('runHealthCheck returns a report with checks array', async () => {
    const report = await runHealthCheck(mockPage, mockAdapter, mockConfig, { silent: true });
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  test('report has passed/warned/failed counts', async () => {
    const report = await runHealthCheck(mockPage, mockAdapter, mockConfig, { silent: true });
    expect(typeof report.passed).toBe('number');
    expect(typeof report.warned).toBe('number');
    expect(typeof report.failed).toBe('number');
  });

  test('healthy is true when no failures', async () => {
    const report = await runHealthCheck(mockPage, mockAdapter, mockConfig, { silent: true });
    expect(report.healthy).toBe(true);
    expect(report.failed).toBe(0);
  });

  test('fails when URL is missing', async () => {
    mockPage.url.mockReturnValueOnce('');
    const report = await runHealthCheck(mockPage, mockAdapter, mockConfig, { silent: true });
    expect(report.healthy).toBe(false);
    expect(report.failed).toBeGreaterThan(0);
  });
});