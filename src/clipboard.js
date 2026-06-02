// src/clipboard.js — System clipboard utility
'use strict';

const { execSync } = require('child_process');

/**
 * Read text from the system clipboard.
 */
function readClipboard() {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      return execSync('pbpaste', { encoding: 'utf8' }).trim();
    } else if (platform === 'win32') {
      return execSync('powershell.exe -NoProfile -Command Get-Clipboard', { encoding: 'utf8' }).trim();
    } else {
      // Linux/Unix
      try {
        return execSync('xclip -selection clipboard -o', { 
          encoding: 'utf8', 
          stdio: ['ignore', 'pipe', 'ignore'] 
        }).trim();
      } catch (err) {
        return execSync('xsel --clipboard --output', { 
          encoding: 'utf8', 
          stdio: ['ignore', 'pipe', 'ignore'] 
        }).trim();
      }
    }
  } catch (err) {
    const error = new Error('Could not read from clipboard. Make sure xclip, xsel, pbpaste, or PowerShell is available and accessible.');
    error.retryable = false;
    throw error;
  }
}

/**
 * Write text to the system clipboard.
 */
function writeClipboard(text) {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else if (platform === 'win32') {
      execSync('powershell.exe -NoProfile -Command "$input | Set-Clipboard"', { input: text });
    } else {
      // Linux/Unix
      try {
        execSync('xclip -selection clipboard', { input: text });
      } catch (err) {
        execSync('xsel --clipboard --input', { input: text });
      }
    }
    return true;
  } catch (err) {
    const error = new Error('Could not write to clipboard. Make sure xclip, xsel, pbcopy, or PowerShell is available and accessible.');
    error.retryable = false;
    throw error;
  }
}

module.exports = { readClipboard, writeClipboard };
