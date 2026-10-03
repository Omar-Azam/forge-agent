// src/audio.js — Cross-platform text-to-speech and alarm utilities
'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORM = process.platform;
const IS_WIN = PLATFORM === 'win32';
const IS_MAC = PLATFORM === 'darwin';

/** Honour a global kill-switch for headless / CI environments. */
function audioDisabled() {
  const v = process.env.FORGE_NO_AUDIO;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Check whether a command exists on PATH. */
function which(cmd) {
  const probe = IS_WIN ? 'where' : 'which';
  try {
    const res = spawnSync(probe, [cmd], { stdio: 'ignore' });
    return res.status === 0;
  } catch (_) {
    return false;
  }
}

/** Strip characters that could break out of shell quoting. */
function sanitize(text) {
  return String(text == null ? '' : text).replace(/[\r\n]/g, ' ').trim();
}

/** Escape single quotes for PowerShell single-quoted strings. */
function psQuote(text) {
  return "'" + String(text).replace(/'/g, "''") + "'";
}

/** Escape a string for a POSIX shell single-quoted argument. */
function shQuote(text) {
  return "'" + String(text).replace(/'/g, "'\\''") + "'";
}

// ─────────────────────────────────────────────
//  Capabilities
// ─────────────────────────────────────────────

/**
 * Report which audio features are available on this host.
 * Useful so the agent can tell the LLM when TTS/audio is unavailable.
 */
function capabilities() {
  const caps = {
    platform: PLATFORM,
    disabled: audioDisabled(),
    tts: [],
    alarm: [],
  };
  if (caps.disabled) return caps;

  if (IS_WIN) {
    caps.tts.push('sapi');
    caps.alarm.push('soundplayer', 'console-beep');
  } else if (IS_MAC) {
    if (which('say')) caps.tts.push('say');
    if (which('afplay')) caps.alarm.push('afplay');
  } else {
    if (which('spd-say')) caps.tts.push('spd-say');
    if (which('espeak-ng')) caps.tts.push('espeak-ng');
    if (which('espeak')) caps.tts.push('espeak');
    if (which('paplay')) caps.alarm.push('paplay');
    if (which('aplay')) caps.alarm.push('aplay');
    if (which('canberra-gtk-play')) caps.alarm.push('canberra-gtk-play');
  }
  caps.tts.push('bell');
  caps.alarm.push('bell');
  return caps;
}

// ─────────────────────────────────────────────
//  Text-to-speech  (call_user)
// ─────────────────────────────────────────────

/**
 * Speak a sentence out loud on the current platform.
 * Returns the backend that was used, or 'bell' as a last resort.
 */
function speak(message) {
  const text = sanitize(message) || 'Task complete.';

  if (audioDisabled()) return 'disabled';

  try {
    if (IS_WIN) {
      const script =
        'Add-Type -AssemblyName System.Speech; ' +
        '(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(' + psQuote(text) + ');';
      execSync('powershell.exe -NoProfile -NonInteractive -Command "' + script.replace(/"/g, '\\"') + '"', {
        stdio: 'ignore',
        timeout: 30000,
      });
      return 'sapi';
    }

    if (IS_MAC && which('say')) {
      execSync('say ' + shQuote(text), { stdio: 'ignore', timeout: 30000 });
      return 'say';
    }

    if (!IS_WIN && !IS_MAC) {
      if (which('spd-say')) {
        execSync('spd-say ' + shQuote(text), { stdio: 'ignore', timeout: 30000 });
        return 'spd-say';
      }
      if (which('espeak-ng')) {
        execSync('espeak-ng ' + shQuote(text), { stdio: 'ignore', timeout: 30000 });
        return 'espeak-ng';
      }
      if (which('espeak')) {
        execSync('espeak ' + shQuote(text), { stdio: 'ignore', timeout: 30000 });
        return 'espeak';
      }
    }
  } catch (_) {
    // fall through to bell
  }

  // Universal fallback: terminal bell
  try { process.stdout.write('\x07'); } catch (_) { /* ignore */ }
  return 'bell';
}

// ─────────────────────────────────────────────
//  Alarm  (raise_alarm)
// ─────────────────────────────────────────────

/** Resolve the bundled alarm wav shipped with the package. */
function alarmWavPath() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'alarm.wav'),
    path.join(__dirname, 'assets', 'alarm.wav'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* ignore */ }
  }
  return null;
}

/**
 * Play an alarm for `duration` seconds on the current platform.
 * Returns the backend used, or 'bell' as a last resort.
 */
function raiseAlarm(duration = 5) {
  const seconds = Math.max(1, Number(duration) || 5);

  if (audioDisabled()) return 'disabled';

  const wav = alarmWavPath();

  try {
    if (IS_WIN) {
      if (wav) {
        const script =
          '$p=New-Object Media.SoundPlayer ' + psQuote(wav) + '; ' +
          '$p.PlaySync();';
        execSync('powershell.exe -NoProfile -NonInteractive -Command "' + script.replace(/"/g, '\\"') + '"', {
          stdio: 'ignore',
          timeout: (seconds + 5) * 1000,
        });
        return 'soundplayer';
      }
      const beeps = Math.max(1, seconds);
      const script =
        'for ($i=0; $i -lt ' + beeps + '; $i++) { [console]::beep(880, 700); Start-Sleep -Milliseconds 150 }';
      execSync('powershell.exe -NoProfile -NonInteractive -Command "' + script + '"', {
        stdio: 'ignore',
        timeout: (seconds + 5) * 1000,
      });
      return 'console-beep';
    }

    if (IS_MAC && which('afplay')) {
      const file = wav || '/System/Library/Sounds/Ping.aiff';
      execSync('afplay ' + shQuote(file), { stdio: 'ignore', timeout: (seconds + 5) * 1000 });
      return 'afplay';
    }

    if (!IS_WIN && !IS_MAC && wav) {
      if (which('paplay')) {
        execSync('paplay ' + shQuote(wav), { stdio: 'ignore', timeout: (seconds + 5) * 1000 });
        return 'paplay';
      }
      if (which('aplay')) {
        execSync('aplay ' + shQuote(wav), { stdio: 'ignore', timeout: (seconds + 5) * 1000 });
        return 'aplay';
      }
      if (which('canberra-gtk-play')) {
        execSync('canberra-gtk-play -f ' + shQuote(wav), { stdio: 'ignore', timeout: (seconds + 5) * 1000 });
        return 'canberra-gtk-play';
      }
    }
  } catch (_) {
    // fall through to bell
  }

  // Universal fallback: repeated terminal bell
  try {
    for (let i = 0; i < Math.max(1, seconds); i++) process.stdout.write('\x07');
  } catch (_) { /* ignore */ }
  return 'bell';
}

module.exports = { speak, raiseAlarm, capabilities, audioDisabled };
