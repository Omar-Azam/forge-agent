// tests/clipboard.test.js — Day 19: Clipboard tool tests
'use strict';

// Mock execSync
const cp = require('child_process');
jest.mock('child_process', () => ({
  execSync: jest.fn(() => '')
}));

const { readClipboard, writeClipboard } = require('../src/clipboard');
const { executeTool, TOOLS } = require('../src/tools');

describe('Clipboard Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cp.execSync.mockReturnValue('');
  });

  test('tools are registered in TOOLS', () => {
    expect(TOOLS.read_clipboard).toBeDefined();
    expect(TOOLS.write_clipboard).toBeDefined();
  });

  test('readClipboard uses pbpaste on macOS', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    
    cp.execSync.mockReturnValue('mac clipboard content');
    
    const content = readClipboard();
    expect(content).toBe('mac clipboard content');
    expect(cp.execSync).toHaveBeenCalledWith('pbpaste', expect.any(Object));

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('readClipboard uses xclip/xsel on Linux', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    
    cp.execSync.mockReturnValue('linux clipboard content');
    
    const content = readClipboard();
    expect(content).toBe('linux clipboard content');
    // It should try xclip first
    expect(cp.execSync).toHaveBeenCalledWith('xclip -selection clipboard -o', expect.any(Object));

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('writeClipboard uses pbcopy on macOS', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    
    writeClipboard('hello mac');
    expect(cp.execSync).toHaveBeenCalledWith('pbcopy', expect.objectContaining({ input: 'hello mac' }));

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('writeClipboard uses powershell on Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    
    writeClipboard('hello windows');
    expect(cp.execSync).toHaveBeenCalledWith(expect.stringContaining('Set-Clipboard'), expect.objectContaining({ input: 'hello windows' }));

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('readClipboard handles failure gracefully', () => {
    cp.execSync.mockImplementation(() => {
      throw new Error('no clipboard tool');
    });

    expect(() => readClipboard()).toThrow(/Could not read from clipboard/);
  });

  test('executeTool write_clipboard returns success message', async () => {
    const result = await executeTool('write_clipboard', { text: 'test data' });
    expect(result).toMatch(/✓ Copied 9 character/);
  });
});
