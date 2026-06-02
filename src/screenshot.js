// src/screenshot.js — System screenshot utility
'use strict';

const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');

/**
 * Capture a screenshot of the entire screen.
 * Tries several common Linux/Unix utilities.
 *
 * @param {string} outputPath - Where to save the image
 * @param {Object} opts
 * @param {number} opts.delay - Delay in milliseconds before capture
 * @returns {Object} { success, path, size, message }
 */
function takeScreenshot(outputPath, opts = {}) {
  const delayMs = opts.delay || 0;

  // Ensure parent directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Check for DISPLAY on Linux
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    return {
      success: false,
      message: 'Cannot take screenshot: No display detected (DISPLAY environment variable is not set).'
    };
  }

  // Common screenshot tools to try in order
  const tools = [
    {
      name: 'scrot',
      cmd: (p, d) => `scrot -d ${Math.floor(d / 1000)} "${p}"`
    },
    {
      name: 'gnome-screenshot',
      cmd: (p, d) => `gnome-screenshot -f "${p}" --delay=${Math.floor(d / 1000)}`
    },
    {
      name: 'import', // ImageMagick
      cmd: (p, d) => {
        const sleepCmd = d > 0 ? `sleep ${d / 1000} && ` : '';
        return `${sleepCmd}import -window root "${p}"`;
      }
    }
  ];

  for (const tool of tools) {
    try {
      execSync(tool.cmd(outputPath, delayMs), { stdio: 'ignore', timeout: 30000 });

      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        return {
          success: true,
          path: outputPath,
          size: stats.size,
          message: `✓ Screenshot captured with ${tool.name} (${stats.size} bytes) → ${outputPath}`
        };
      }
    } catch (err) {
      // Try next tool
    }
  }

  return {
    success: false,
    message: 'Failed to capture screenshot. Please ensure scrot, gnome-screenshot, or ImageMagick is installed and a display is available.'
  };
}

module.exports = { takeScreenshot };
