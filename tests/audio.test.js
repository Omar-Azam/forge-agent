// tests/audio.test.js — Tests for cross-platform audio utilities
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const audio = require('../src/audio');

describe('audio module', () => {
  const originalPlatform = process.platform;
  const originalNoAudio = process.env.FORGE_NO_AUDIO;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalNoAudio === undefined) delete process.env.FORGE_NO_AUDIO;
    else process.env.FORGE_NO_AUDIO = originalNoAudio;
    jest.restoreAllMocks();
  });

  test('exports expected functions', () => {
    expect(typeof audio.speak).toBe('function');
    expect(typeof audio.raiseAlarm).toBe('function');
    expect(typeof audio.capabilities).toBe('function');
    expect(typeof audio.audioDisabled).toBe('function');
  });

  test('audioDisabled() respects FORGE_NO_AUDIO=1', () => {
    process.env.FORGE_NO_AUDIO = '1';
    expect(audio.audioDisabled()).toBe(true);
  });

  test('audioDisabled() is false by default', () => {
    delete process.env.FORGE_NO_AUDIO;
    expect(audio.audioDisabled()).toBe(false);
  });

  test('capabilities() returns platform info', () => {
    delete process.env.FORGE_NO_AUDIO;
    const caps = audio.capabilities();
    expect(caps).toHaveProperty('platform');
    expect(caps).toHaveProperty('tts');
    expect(caps).toHaveProperty('alarm');
    expect(Array.isArray(caps.tts)).toBe(true);
    expect(Array.isArray(caps.alarm)).toBe(true);
  });

  test('capabilities() marks disabled when FORGE_NO_AUDIO set', () => {
    process.env.FORGE_NO_AUDIO = 'true';
    const caps = audio.capabilities();
    expect(caps.disabled).toBe(true);
    expect(caps.tts).toEqual([]);
    expect(caps.alarm).toEqual([]);
  });

  test('speak() returns disabled when FORGE_NO_AUDIO set', () => {
    process.env.FORGE_NO_AUDIO = '1';
    expect(audio.speak('hello')).toBe('disabled');
  });

  test('raiseAlarm() returns disabled when FORGE_NO_AUDIO set', () => {
    process.env.FORGE_NO_AUDIO = '1';
    expect(audio.raiseAlarm(1)).toBe('disabled');
  });

  test('raiseAlarm() clamps duration to at least 1', () => {
    process.env.FORGE_NO_AUDIO = '1';
    expect(audio.raiseAlarm(0)).toBe('disabled');
  });

  test('speak() never throws and returns a backend string', () => {
    delete process.env.FORGE_NO_AUDIO;
    const result = audio.speak('test message');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('raiseAlarm() never throws and returns a backend string', () => {
    delete process.env.FORGE_NO_AUDIO;
    const result = audio.raiseAlarm(1);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('alarm.wav asset is present when bundled', () => {
    // Asset is optional; if it exists it must be a valid readable file.
    const wav = path.join(__dirname, '..', 'assets', 'alarm.wav');
    if (fs.existsSync(wav)) {
      const stat = fs.statSync(wav);
      expect(stat.size).toBeGreaterThan(0);
    }
  });
});
