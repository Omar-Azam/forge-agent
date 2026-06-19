// tests/browser.test.js — Day 3: Browser tests (Playwright mocked)
'use strict';

// ─────────────────────────────────────────────────────────
//  Mock Playwright entirely so tests run without a browser
// ─────────────────────────────────────────────────────────

const mockPage = {
  goto            : jest.fn().mockResolvedValue(undefined),
  waitForTimeout  : jest.fn().mockResolvedValue(undefined),
  waitForSelector : jest.fn().mockResolvedValue({}),
  evaluate        : jest.fn(),
  addInitScript   : jest.fn().mockResolvedValue(undefined),
  keyboard        : { press: jest.fn().mockResolvedValue(undefined) },
  screenshot      : jest.fn().mockResolvedValue(undefined),
  $               : jest.fn(),
  locator         : jest.fn(),
};

const mockContext = {
  pages    : jest.fn().mockReturnValue([mockPage]),
  newPage  : jest.fn().mockResolvedValue(mockPage),
  close    : jest.fn().mockResolvedValue(undefined),
};

jest.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: jest.fn().mockResolvedValue(mockContext),
  },
}));

jest.mock('../src/config', () => ({
  DEEPSEEK_URL     : 'https://chat.deepseek.com',
  SESSION_DIR      : '/tmp/dsa-test-session',
  HEADLESS         : false,
  MODEL            : 'deepseek',
  RESPONSE_TIMEOUT : 5000,
  STABLE_DELAY     : 500,
  SEND_DELAY       : 50,
  DEBUG            : false,
}));

jest.mock('../src/logger', () => ({
  info      : jest.fn(),
  success   : jest.fn(),
  warn      : jest.fn(),
  error     : jest.fn(),
  dim       : jest.fn(),
  thinking  : jest.fn(),
  clearLine : jest.fn(),
  banner    : jest.fn(),
  separator : jest.fn(),
}));

const mockAdapter = {
  sendMessage: jest.fn(),
  waitForResponse: jest.fn().mockResolvedValue('response'),
  newChat: jest.fn(),
};

jest.mock('../src/adapter-factory', () => ({
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
  getModelUrl: jest.fn().mockReturnValue('https://chat.deepseek.com'),
}));

// Mock health check so launch() doesn't need complex evaluate setup
jest.mock('../src/health', () => ({
  runHealthCheckWithReAuth: jest.fn().mockResolvedValue({
    checks: [], passed: 6, warned: 0, failed: 0, healthy: true,
  }),
}));

const DeepSeekBrowser = require('../src/browser');

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────

function makeBrowser() {
  const b = new DeepSeekBrowser();
  b.context = mockContext;
  b.page    = mockPage;
  b.adapter = mockAdapter;
  return b;
}

beforeEach(() => {
  jest.resetAllMocks();

  // Restore playwright mock after reset
  const { chromium } = require('playwright');
  chromium.launchPersistentContext.mockResolvedValue(mockContext);

  // Restore page mocks
  mockPage.goto.mockResolvedValue(undefined);
  mockPage.waitForTimeout.mockResolvedValue(undefined);
  mockPage.waitForSelector.mockResolvedValue({});
  mockPage.addInitScript.mockResolvedValue(undefined);
  mockPage.keyboard.press.mockResolvedValue(undefined);
  mockPage.screenshot.mockResolvedValue(undefined);
  
  mockContext.pages.mockReturnValue([mockPage]);
  mockContext.newPage.mockResolvedValue(mockPage);
  mockContext.close.mockResolvedValue(undefined);
  
  // Restore adapter mocks
  mockAdapter.sendMessage.mockResolvedValue(undefined);
  mockAdapter.waitForResponse.mockResolvedValue('response');
  mockAdapter.newChat.mockResolvedValue(undefined);

  // Default: page is at deepseek, logged in
  mockPage.evaluate.mockResolvedValue(false);
  
  const { getAdapter, getModelUrl } = require('../src/adapter-factory');
  getAdapter.mockReturnValue(mockAdapter);
  getModelUrl.mockReturnValue('https://chat.deepseek.com');

  require('../src/health').runHealthCheckWithReAuth.mockResolvedValue({
    checks: [], passed: 6, warned: 0, failed: 0, healthy: true,
  });
});

// ─────────────────────────────────────────────────────────
//  launch() — constructor & Playwright wiring
// ─────────────────────────────────────────────────────────

describe('launch()', () => {
  test('calls launchPersistentContext with correct args', async () => {
    const { chromium } = require('playwright');
    const browser = new DeepSeekBrowser();

    await browser.launch();

    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      expect.stringContaining('dsa-test-session'),
      expect.objectContaining({
        headless : false,
        viewport : expect.objectContaining({ width: 1280, height: 900 }),
      })
    );
  });

  test('navigates to model URL after launch', async () => {
    const browser = new DeepSeekBrowser();
    await browser.launch();
    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://chat.deepseek.com',
      expect.any(Object)
    );
  });

  test('initializes adapter via factory', async () => {
    const { getAdapter } = require('../src/adapter-factory');
    const browser = new DeepSeekBrowser();
    await browser.launch();
    expect(getAdapter).toHaveBeenCalledWith('deepseek', mockPage, expect.any(Object));
    expect(browser.adapter).toBe(mockAdapter);
  });

  test('reuses existing page if one is already open', async () => {
    const browser = new DeepSeekBrowser();
    mockContext.pages.mockReturnValueOnce([mockPage, mockPage]);
    await browser.launch();
    expect(mockContext.newPage).not.toHaveBeenCalled();
  });

  test('opens a new page if context has none', async () => {
    const browser = new DeepSeekBrowser();
    mockContext.pages.mockReturnValueOnce([]);
    await browser.launch();
    expect(mockContext.newPage).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────
//  close()
// ─────────────────────────────────────────────────────────

describe('close()', () => {
  test('calls context.close()', async () => {
    const browser = makeBrowser();
    await browser.close();
    expect(mockContext.close).toHaveBeenCalled();
  });

  test('is idempotent — second call does not throw', async () => {
    const browser = makeBrowser();
    await browser.close();
    await expect(browser.close()).resolves.not.toThrow();
  });

  test('sets _closed flag', async () => {
    const browser = makeBrowser();
    expect(browser._closed).toBe(false);
    await browser.close();
    expect(browser._closed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
//  Health check wiring
// ─────────────────────────────────────────────────────────

describe('Health check wiring', () => {
  test('launch() calls runHealthCheckWithReAuth', async () => {
    const { runHealthCheckWithReAuth } = require('../src/health');
    const browser = new DeepSeekBrowser();
    await browser.launch();
    expect(runHealthCheckWithReAuth).toHaveBeenCalledWith(
      mockPage,
      expect.anything(),
      expect.anything(),
      expect.any(Function)
    );
  });
});

// ─────────────────────────────────────────────────────────
//  sendMessage() — delegation to adapter
// ─────────────────────────────────────────────────────────

describe('sendMessage()', () => {
  test('delegates to adapter.sendMessage', async () => {
    const browser = makeBrowser();
    await browser.sendMessage('hello world');
    expect(mockAdapter.sendMessage).toHaveBeenCalledWith('hello world');
  });

  test('throws if not initialized', async () => {
    const browser = new DeepSeekBrowser();
    await expect(browser.sendMessage('test')).rejects.toThrow(/not initialized/);
  });
});

// ─────────────────────────────────────────────────────────
//  waitForResponse() — delegation to adapter
// ─────────────────────────────────────────────────────────

describe('waitForResponse()', () => {
  test('delegates to adapter.waitForResponse', async () => {
    const browser = makeBrowser();
    const resp = await browser.waitForResponse();
    expect(mockAdapter.waitForResponse).toHaveBeenCalled();
    expect(resp).toBe('response');
  });

  test('throws if not initialized', async () => {
    const browser = new DeepSeekBrowser();
    await expect(browser.waitForResponse()).rejects.toThrow(/not initialized/);
  });
});

// ─────────────────────────────────────────────────────────
//  newChat() — delegation to adapter
// ─────────────────────────────────────────────────────────

describe('newChat()', () => {
  test('delegates to adapter.newChat', async () => {
    const browser = makeBrowser();
    await browser.newChat();
    expect(mockAdapter.newChat).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────
//  screenshot()
// ─────────────────────────────────────────────────────────

describe('screenshot()', () => {
  test('calls page.screenshot with the given path', async () => {
    const browser = makeBrowser();
    await browser.screenshot('/tmp/test-shot.png');
    expect(mockPage.screenshot).toHaveBeenCalledWith({
      path     : '/tmp/test-shot.png',
      fullPage : false,
    });
  });
});
