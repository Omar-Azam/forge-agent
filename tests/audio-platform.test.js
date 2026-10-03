// tests/audio-platform.test.js — Platform-branch coverage for src/audio.js
// Verifies the cross-platform code paths (win32 / darwin / linux) by mocking
// child_process and reloading the module with a simulated process.platform.
'use strict';

// child_process must be mocked BEFORE audio.js is required.
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn(),
}));

/**
 * Reload src/audio with a simulated platform.
 * Because jest.resetModules() creates a fresh mock registry, we re-require
 * child_process each time and return the *current* mock instances.
 */
function loadAudio(platform) {
  jest.resetModules();
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  const cp = require('child_process');
  cp.execSync.mockReset();
  cp.spawnSync.mockReset();
  cp.execSync.mockReturnValue(Buffer.from(''));
  const mod = require('../src/audio');
  return { mod, execSync: cp.execSync, spawnSync: cp.spawnSync };
}

describe('audio platform branching', () => {
  const originalPlatform = process.platform;
  const originalNoAudio = process.env.FORGE_NO_AUDIO;

  beforeEach(() => {
    delete process.env.FORGE_NO_AUDIO;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    if (originalNoAudio === undefined) delete process.env.FORGE_NO_AUDIO;
    else process.env.FORGE_NO_AUDIO = originalNoAudio;
    jest.resetModules();
  });

  // ── Windows ────────────────────────────────────────────────
  describe('win32', () => {
    test('speak() uses SAPI via PowerShell', () => {
      const { mod, execSync: es } = loadAudio('win32');
      const backend = mod.speak('hello world');
      expect(backend).toBe('sapi');
      expect(es).toHaveBeenCalledTimes(1);
      const cmd = es.mock.calls[0][0];
      expect(cmd).toContain('powershell.exe');
      expect(cmd).toContain('System.Speech');
      expect(cmd).toContain('Speak');
    });

    test('speak() escapes single quotes for PowerShell', () => {
      const { mod, execSync: es } = loadAudio('win32');
      mod.speak("it's fine");
      const cmd = es.mock.calls[0][0];
      expect(cmd).toContain("it''s fine");
    });

    test('raiseAlarm() uses SoundPlayer when alarm.wav exists', () => {
      const { mod, execSync: es } = loadAudio('win32');
      const backend = mod.raiseAlarm(1);
      expect(backend).toBe('soundplayer');
      const cmd = es.mock.calls[0][0];
      expect(cmd).toContain('Media.SoundPlayer');
      expect(cmd).toContain('PlaySync');
    });

    test('capabilities() reports sapi + soundplayer', () => {
      const { mod } = loadAudio('win32');
      const caps = mod.capabilities();
      expect(caps.tts).toContain('sapi');
      expect(caps.alarm).toContain('soundplayer');
      expect(caps.tts).toContain('bell');
    });
  });

  // ── macOS ──────────────────────────────────────────────────
  describe('darwin', () => {
    test('speak() uses `say` when available', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('darwin');
      ss.mockReturnValue({ status: 0 });
      const backend = mod.speak('hi');
      expect(backend).toBe('say');
      expect(es.mock.calls[0][0]).toMatch(/^say /);
      expect(ss).toHaveBeenCalled();
    });

    test('raiseAlarm() uses afplay when available', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('darwin');
      ss.mockReturnValue({ status: 0 });
      const backend = mod.raiseAlarm(1);
      expect(backend).toBe('afplay');
      expect(es.mock.calls[0][0]).toMatch(/^afplay /);
    });

    test('speak() falls back to bell when no TTS binary exists', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('darwin');
      ss.mockReturnValue({ status: 1 });
      const backend = mod.speak('hi');
      expect(backend).toBe('bell');
      expect(es).not.toHaveBeenCalled();
    });
  });

  // ── Linux ──────────────────────────────────────────────────
  describe('linux', () => {
    test('speak() prefers spd-say', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('linux');
      ss.mockReturnValue({ status: 0 });
      const backend = mod.speak('hi');
      expect(backend).toBe('spd-say');
      expect(es.mock.calls[0][0]).toMatch(/^spd-say /);
    });

    test('speak() falls back to espeak-ng', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('linux');
      ss.mockImplementation((probe, [cmd]) => ({ status: cmd === 'espeak-ng' ? 0 : 1 }));
      expect(mod.speak('hi')).toBe('espeak-ng');
      expect(es.mock.calls[0][0]).toMatch(/^espeak-ng /);
    });

    test('speak() falls back to espeak as last resort', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('linux');
      ss.mockImplementation((probe, [cmd]) => ({ status: cmd === 'espeak' ? 0 : 1 }));
      expect(mod.speak('hi')).toBe('espeak');
      expect(es.mock.calls[0][0]).toMatch(/^espeak /);
    });

    test('raiseAlarm() uses paplay for bundled wav', () => {
      const { mod, execSync: es, spawnSync: ss } = loadAudio('linux');
      ss.mockReturnValue({ status: 0 });
      const backend = mod.raiseAlarm(1);
      expect(backend).toBe('paplay');
      expect(es.mock.calls[0][0]).toMatch(/^paplay /);
    });
  });

  // ── Cross-platform robustness ──────────────────────────────
  describe('robustness', () => {
    test('speak() swallows execSync errors and returns bell', () => {
      const { mod, execSync: es } = loadAudio('win32');
      es.mockImplementation(() => { throw new Error('powershell missing'); });
      expect(mod.speak('hi')).toBe('bell');
    });

    test('raiseAlarm() swallows execSync errors and returns bell', () => {
      const { mod, execSync: es } = loadAudio('win32');
      es.mockImplementation(() => { throw new Error('no sound device'); });
      expect(mod.raiseAlarm(1)).toBe('bell');
    });

    test('FORGE_NO_AUDIO short-circuits both tools before spawning', () => {
      process.env.FORGE_NO_AUDIO = 'true';
      const { mod, execSync: es, spawnSync: ss } = loadAudio('linux');
      ss.mockReturnValue({ status: 0 });
      expect(mod.speak('hi')).toBe('disabled');
      expect(mod.raiseAlarm(1)).toBe('disabled');
      expect(es).not.toHaveBeenCalled();
      expect(ss).not.toHaveBeenCalled();
    });

    test('raiseAlarm() clamps non-numeric duration safely', () => {
      const { mod } = loadAudio('win32');
      expect(typeof mod.raiseAlarm(undefined)).toBe('string');
      expect(typeof mod.raiseAlarm('abc')).toBe('string');
      expect(typeof mod.raiseAlarm(-5)).toBe('string');
    });
  });
});
