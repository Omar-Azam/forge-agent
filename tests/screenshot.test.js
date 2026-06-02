// tests/screenshot.test.js — Day 18: Screenshot tool tests
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP_DIR = path.join(os.tmpdir(), 'dsa-screenshot-test-' + Date.now());
fs.mkdirSync(TMP_DIR, { recursive: true });

process.env._DSA_TEST_DIR = TMP_DIR;

jest.mock('../src/config', () => ({
  WORKING_DIR      : process.env._DSA_TEST_DIR,
  MAX_OUTPUT_LENGTH: 8000,
  SESSION_DIR      : require('path').join(require('os').tmpdir(), 'dsa-screenshot-session'),
  STRICT_SANDBOX   : false,
  DEBUG            : false,
}));

// Mock execSync to avoid running actual commands
const cp = require('child_process');
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const { takeScreenshot } = require('../src/screenshot');
const { executeTool, TOOLS } = require('../src/tools');

describe('Screenshot Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('tool is registered in TOOLS', () => {
    expect(TOOLS.take_screenshot).toBeDefined();
    expect(typeof TOOLS.take_screenshot.execute).toBe('function');
  });

  test('takeScreenshot returns graceful failure when no DISPLAY on Linux', () => {
    const originalPlatform = process.platform;
    const originalDisplay = process.env.DISPLAY;
    
    // Force linux and no DISPLAY
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.DISPLAY;

    const result = takeScreenshot(path.join(TMP_DIR, 'fail.png'));
    
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No display detected/);

    // Restore
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalDisplay) process.env.DISPLAY = originalDisplay;
  });

  test('takeScreenshot tries multiple tools until success', () => {
    const testPath = path.join(TMP_DIR, 'success.png');
    
    // Simulate scrot failing, but gnome-screenshot succeeding
    cp.execSync.mockImplementation((cmd) => {
      if (cmd.includes('scrot')) {
        throw new Error('scrot not found');
      }
      // Simulate file creation by the tool
      fs.writeFileSync(testPath, 'fake image data');
      return Buffer.from('');
    });

    // Ensure DISPLAY is set for this test
    process.env.DISPLAY = ':0';

    const result = takeScreenshot(testPath);
    
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/gnome-screenshot/);
    expect(cp.execSync).toHaveBeenCalledTimes(2); // scrot then gnome
    expect(fs.existsSync(testPath)).toBe(true);
  });

  test('takeScreenshot returns failure if no tools work', () => {
    cp.execSync.mockImplementation(() => {
      throw new Error('command failed');
    });

    const result = takeScreenshot(path.join(TMP_DIR, 'all-fail.png'));
    
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Failed to capture screenshot/);
  });

  test('tool execute returns result message', async () => {
    const testPath = path.join(TMP_DIR, 'tool-exec.png');
    cp.execSync.mockImplementation(() => {
      fs.writeFileSync(testPath, 'fake data');
      return Buffer.from('');
    });

    const result = await executeTool('take_screenshot', { path: testPath });
    expect(result).toMatch(/✓ Screenshot captured/);
  });

  test('take_screenshot result shape', () => {
    const testPath = path.join(TMP_DIR, 'shape.png');
    cp.execSync.mockImplementation(() => {
      fs.writeFileSync(testPath, 'fake data');
      return Buffer.from('');
    });

    const result = takeScreenshot(testPath);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('message');
  });
});
