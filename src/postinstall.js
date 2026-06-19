// src/postinstall.js — Runs after `npm install -g forge-agent`
// Automatically downloads the Playwright Chromium browser.
'use strict';

const { execSync } = require('child_process');
const path         = require('path');
const os           = require('os');

// Skip in CI environments where a display isn't available
if (process.env.CI || process.env.SKIP_PLAYWRIGHT_INSTALL) {
  console.log('[forge-agent] Skipping Playwright browser install (CI detected).');
  process.exit(0);
}

try {
  // Use the playwright binary bundled in this package's node_modules
  const playwrightBin = path.join(__dirname, '..', 'node_modules', '.bin', 'playwright');

  execSync(`"${playwrightBin}" install chromium`, {
    stdio : 'inherit',
    env   : { ...process.env },
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🔨  Forge Agent — Setup Complete                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  ✓ Chromium browser downloaded and ready.');
  console.log('');
  console.log('  Get started:');
  console.log('    forge-agent --setup');
  console.log('    forge-agent --interactive');
  console.log('    forge-agent "build a REST API with Express"');
  console.log('    fa "your task"');
  console.log('');
  console.log('  Documentation:');
  console.log('    https://github.com/Omar-Azam/forge-agent');
  console.log('');
} catch (err) {
  console.warn('');
  console.warn('  ⚠  Could not auto-install Chromium.');
  console.warn('  Run this manually to complete setup:');
  console.warn('');
  console.warn('    npx playwright install chromium');
  console.warn('');
  // Don't exit(1) — don't break the install if browser download fails
}
