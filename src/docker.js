// src/docker.js — Utilities for Docker environment detection and adaptation
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Check if the agent is running inside a Docker container.
 * Uses multiple signals for robust detection.
 */
function isRunningInDocker() {
  try {
    // 1. /.dockerenv file exists
    if (fs.existsSync('/.dockerenv')) return true;

    // 2. /proc/1/cgroup contains 'docker'
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (cgroup.includes('docker')) return true;
    }

    // 3. process.env.DOCKER_CONTAINER is set
    if (process.env.DOCKER_CONTAINER === 'true' || process.env.DOCKER_CONTAINER === '1') {
      return true;
    }

    return false;
  } catch (err) {
    // Never throw — fallback to false on any error
    return false;
  }
}

/**
 * Get the workspace path for the current environment.
 */
function getDockerWorkspace() {
  try {
    if (module.exports.isRunningInDocker()) {
      return '/workspace';
    }
    return process.cwd();
  } catch {
    return process.cwd();
  }
}

/**
 * Adjust configuration for Docker environment.
 */
function applyDockerDefaults(config) {
  try {
    if (module.exports.isRunningInDocker()) {
      config.HEADLESS = true;   // always headless in Docker
      config.WORKING_DIR = module.exports.getDockerWorkspace();
    }
    return config;
  } catch (err) {
    return config;
  }
}

/**
 * Print information about the Docker environment.
 */
function printDockerInfo() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    if (module.exports.isRunningInDocker()) {
      const logger = require('./logger');
      logger.dim('  🐳 Running in Docker container');
      logger.dim('  📂 Workspace: /workspace');
      logger.dim('  🔒 Browser: headless mode (automatic)');
    }
  } catch {
    // ignore
  }
}

module.exports = {
  isRunningInDocker,
  getDockerWorkspace,
  applyDockerDefaults,
  printDockerInfo
};
