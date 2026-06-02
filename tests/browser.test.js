// tests/browser.test.js — Day 3: Browser selector tests (Playwright mocked)
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
  // Default: page is at deepseek, logged in
  mockPage.evaluate.mockResolvedValue(false);
  require('../src/health').runHealthCheckWithReAuth.mockResolvedValue({
    checks: [], passed: 6, warned: 0, failed: 0, healthy: true,
  });
});

// ─────────────────────────────────────────────────────────
//  SEL selector bank — validate structure
// ─────────────────────────────────────────────────────────

describe('SEL selector bank', () => {
  // Access the SEL object by parsing the source file properly
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/browser.js'), 'utf8'
  );

  function extractSelectors(name) {
    // Match the array for a named key inside the SEL object
    const blockMatch = src.match(
      new RegExp(name + '\\s*:\\s*\\[([\\s\\S]*?)\\],?\\s*\\n\\s*(?:\\/\\/|\\w)')
    );
    if (!blockMatch) return [];
    const block = blockMatch[1];
    // Extract every quoted string from the block
    const sels = [];
    const re = /['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      sels.push(m[1]);
    }
    return sels;
  }

  test('chatInput has at least 3 fallback selectors', () => {
    const sels = extractSelectors('chatInput');
    expect(sels.length).toBeGreaterThanOrEqual(3);
  });

  test('sendButton has at least 4 fallback selectors', () => {
    const sels = extractSelectors('sendButton');
    expect(sels.length).toBeGreaterThanOrEqual(4);
  });

  test('stopButton has at least 3 fallback selectors', () => {
    const sels = extractSelectors('stopButton');
    expect(sels.length).toBeGreaterThanOrEqual(3);
  });

  test('newChat has at least 3 fallback selectors', () => {
    const sels = extractSelectors('newChat');
    expect(sels.length).toBeGreaterThanOrEqual(3);
  });

  test('messageContainer has at least 3 fallback selectors', () => {
    const sels = extractSelectors('messageContainer');
    expect(sels.length).toBeGreaterThanOrEqual(3);
  });

  test('chatInput selectors are valid CSS strings', () => {
    const sels = extractSelectors('chatInput');
    sels.forEach(sel => {
      expect(typeof sel).toBe('string');
      expect(sel.length).toBeGreaterThan(0);
      expect(sel).not.toContain('undefined');
    });
  });

  test('all selector groups have string entries only', () => {
    ['chatInput', 'sendButton', 'stopButton', 'newChat', 'messageContainer'].forEach(group => {
      extractSelectors(group)
        .filter(sel => sel.trim().length > 0)
        .forEach(sel => {
          expect(typeof sel).toBe('string');
          expect(sel.trim().length).toBeGreaterThan(0);
          expect(sel).not.toContain('undefined');
        });
    });
  });
});

// ─────────────────────────────────────────────────────────
//  _cleanText — no browser needed
// ─────────────────────────────────────────────────────────

describe('_cleanText', () => {
  let browser;
  beforeEach(() => { browser = makeBrowser(); });

  test('returns empty string for null/undefined', () => {
    expect(browser._cleanText(null)).toBe('');
    expect(browser._cleanText(undefined)).toBe('');
    expect(browser._cleanText('')).toBe('');
  });

  test('strips DeepSeek R1 <think> blocks', () => {
    const raw = '<think>\nLet me think step by step...\n</think>\nThe answer is 42.';
    expect(browser._cleanText(raw)).toBe('The answer is 42.');
  });

  test('strips multiline <think> blocks', () => {
    const raw = '<think>\nline1\nline2\nline3\n</think>\nDone.';
    const result = browser._cleanText(raw);
    expect(result).not.toContain('<think>');
    expect(result).not.toContain('line1');
    expect(result).toBe('Done.');
  });

  test('strips copy-code button artifacts', () => {
    const raw = '1CopyRunInsert\nsome code here\n2CopyRunInsert\nmore code';
    const result = browser._cleanText(raw);
    expect(result).not.toMatch(/\dCopy/);
    expect(result).toContain('some code here');
  });

  test('collapses 3+ blank lines to 2', () => {
    const raw = 'para1\n\n\n\n\npara2';
    const result = browser._cleanText(raw);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain('para1');
    expect(result).toContain('para2');
  });

  test('trims leading and trailing whitespace', () => {
    expect(browser._cleanText('  hello  ')).toBe('hello');
    expect(browser._cleanText('\n\nhello\n\n')).toBe('hello');
  });

  test('preserves normal response text unchanged', () => {
    const raw = 'I have created the calculator with index.html, style.css, and script.js.';
    expect(browser._cleanText(raw)).toBe(raw);
  });

  test('strips Thinking... prefix from R1 model', () => {
    const raw = 'Thinking...\nSome internal reasoning\n\nThe task is complete.';
    const result = browser._cleanText(raw);
    expect(result).not.toMatch(/^Thinking/);
  });

  test('handles multiple <think> blocks', () => {
    const raw = '<think>first</think>\ntext\n<think>second</think>\nmore text';
    const result = browser._cleanText(raw);
    expect(result).not.toContain('<think>');
    expect(result).toContain('text');
    expect(result).toContain('more text');
  });
});

// ─────────────────────────────────────────────────────────
//  launch() — constructor & Playwright wiring
// ─────────────────────────────────────────────────────────

describe('launch()', () => {
  test('calls launchPersistentContext with correct args', async () => {
    const { chromium } = require('playwright');
    const browser = new DeepSeekBrowser();

    // Prevent login prompt in tests
    mockPage.evaluate.mockResolvedValueOnce(false);

    await browser.launch();

    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      expect.stringContaining('dsa-test-session'),
      expect.objectContaining({
        headless : false,
        viewport : expect.objectContaining({ width: 1280, height: 900 }),
      })
    );
  });

  test('navigates to DeepSeek URL after launch', async () => {
    const browser = new DeepSeekBrowser();
    mockPage.evaluate.mockResolvedValueOnce(false);
    await browser.launch();
    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://chat.deepseek.com',
      expect.any(Object)
    );
  });

  test('reuses existing page if one is already open', async () => {
    const browser = new DeepSeekBrowser();
    mockContext.pages.mockReturnValueOnce([mockPage, mockPage]);
    mockPage.evaluate.mockResolvedValueOnce(false);
    await browser.launch();
    expect(mockContext.newPage).not.toHaveBeenCalled();
  });

  test('opens a new page if context has none', async () => {
    const browser = new DeepSeekBrowser();
    mockContext.pages.mockReturnValueOnce([]);
    mockPage.evaluate.mockResolvedValueOnce(false);
    await browser.launch();
    expect(mockContext.newPage).toHaveBeenCalled();
  });

  test('sets page reference after launch', async () => {
    const browser = new DeepSeekBrowser();
    mockPage.evaluate.mockResolvedValueOnce(false);
    await browser.launch();
    expect(browser.page).toBe(mockPage);
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
      expect.any(Function)
    );
  });

  test('launch() passes reLogin callback to health check', async () => {
    const { runHealthCheckWithReAuth } = require('../src/health');
    const browser = new DeepSeekBrowser();
    const bannerSpy = jest.spyOn(browser, '_printLoginBanner').mockImplementation(() => {});
    const enterSpy  = jest.spyOn(browser, '_waitForEnter').mockResolvedValue(undefined);

    // Capture the reLogin callback and call it
    runHealthCheckWithReAuth.mockImplementationOnce(async (page, reLogin) => {
      await reLogin();
      return { checks: [], passed: 6, warned: 0, failed: 0, healthy: true };
    });

    await browser.launch();
    expect(bannerSpy).toHaveBeenCalled();
    expect(enterSpy).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────
//  sendMessage() — input detection and message sending
// ─────────────────────────────────────────────────────────

describe('sendMessage()', () => {
  test('fills textarea and presses Enter when no send button found', async () => {
    const browser = makeBrowser();

    const mockTextarea = {
      click    : jest.fn().mockResolvedValue(undefined),
      fill     : jest.fn().mockResolvedValue(undefined),
      evaluate : jest.fn().mockResolvedValue(undefined),
    };
    mockPage.waitForSelector.mockResolvedValueOnce(mockTextarea);
    mockTextarea.evaluate
      .mockResolvedValueOnce('textarea')  // tagName
      .mockResolvedValueOnce(false)       // isContentEditable
      .mockResolvedValueOnce(undefined);  // selectAll

    // No send button found
    mockPage.$.mockResolvedValue(null);

    await browser.sendMessage('hello world');

    expect(mockTextarea.fill).toHaveBeenCalledWith('hello world');
    expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
  });

  test('clicks send button when it is visible and enabled', async () => {
    const browser = makeBrowser();

    const mockTextarea = {
      click    : jest.fn().mockResolvedValue(undefined),
      fill     : jest.fn().mockResolvedValue(undefined),
      evaluate : jest.fn().mockResolvedValue(undefined),
    };
    const mockSendBtn = {
      isVisible : jest.fn().mockResolvedValue(true),
      isEnabled : jest.fn().mockResolvedValue(true),
      click     : jest.fn().mockResolvedValue(undefined),
    };

    mockPage.waitForSelector.mockResolvedValueOnce(mockTextarea);
    mockTextarea.evaluate
      .mockResolvedValueOnce('textarea')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(undefined);

    // First $ call returns the send button
    mockPage.$.mockResolvedValueOnce(mockSendBtn);

    await browser.sendMessage('test message');
    expect(mockSendBtn.click).toHaveBeenCalled();
  });

  test('throws when no input element found', async () => {
    const browser = makeBrowser();
    mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));
    await expect(browser.sendMessage('test')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
//  _getMessageCount() — message counting
// ─────────────────────────────────────────────────────────

describe('_getMessageCount()', () => {
  test('returns count from evaluate', async () => {
    const browser = makeBrowser();
    mockPage.evaluate.mockResolvedValueOnce(3);
    const count = await browser._getMessageCount();
    expect(count).toBe(3);
  });

  test('returns 0 when no messages', async () => {
    const browser = makeBrowser();
    mockPage.evaluate.mockResolvedValueOnce(0);
    const count = await browser._getMessageCount();
    expect(count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
//  _extractLastMessage() — text extraction
// ─────────────────────────────────────────────────────────

describe('_extractLastMessage()', () => {
  test('returns extracted text from page.evaluate', async () => {
    const browser = makeBrowser();
    mockPage.evaluate.mockResolvedValueOnce('tool_call\n{ "name": "read_file", "args": {} }');
    const result = await browser._extractLastMessage();
    expect(result).toContain('tool_call');
  });

  test('returns empty string when page returns empty', async () => {
    const browser = makeBrowser();
    mockPage.evaluate.mockResolvedValueOnce('');
    const result = await browser._extractLastMessage();
    expect(result).toBe('');
  });
});

// ─────────────────────────────────────────────────────────
//  _isGenerating() — streaming detection
// ─────────────────────────────────────────────────────────

describe('_isGenerating()', () => {
  test('returns true when evaluate returns true', async () => {
    const browser = makeBrowser();
    mockPage.evaluate.mockResolvedValueOnce(true);
    expect(await browser._isGenerating()).toBe(true);
  });

  test('returns false when evaluate returns false', async () => {
    const browser = makeBrowser();
    mockPage.evaluate.mockResolvedValueOnce(false);
    expect(await browser._isGenerating()).toBe(false);
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

  test('uses default path when none provided', async () => {
    const browser = makeBrowser();
    await browser.screenshot();
    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('.png') })
    );
  });
});
