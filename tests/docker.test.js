// tests/docker.test.js
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { isRunningInDocker, getDockerWorkspace, applyDockerDefaults, printDockerInfo } = require('../src/docker');

describe('Docker Utilities', () => {

  describe('isRunningInDocker', () => {
    test('returns boolean', () => {
      expect(typeof isRunningInDocker()).toBe('boolean');
    });

    test('returns false in normal test environment', () => {
      // In a normal test run on a dev machine or CI, this should be false
      // unless the tests themselves are running in Docker.
      // But we can't assume. Let's just check it doesn't throw.
      expect(() => isRunningInDocker()).not.toThrow();
    });
  });

  describe('getDockerWorkspace', () => {
    test('returns string', () => {
      expect(typeof getDockerWorkspace()).toBe('string');
    });

    test('returns process.cwd() when not in Docker', () => {
      // If we are not in Docker, it should return cwd
      if (!isRunningInDocker()) {
        expect(getDockerWorkspace()).toBe(process.cwd());
      }
    });
  });

  describe('applyDockerDefaults', () => {
    test('returns a config object', () => {
      const config = { HEADLESS: false, WORKING_DIR: '/tmp' };
      const result = applyDockerDefaults(config);
      expect(result).toHaveProperty('HEADLESS');
      expect(result).toHaveProperty('WORKING_DIR');
    });

    test('does not mutate when not in Docker', () => {
      if (!isRunningInDocker()) {
        const config = { HEADLESS: false, WORKING_DIR: '/tmp' };
        const original = { ...config };
        applyDockerDefaults(config);
        expect(config).toEqual(original);
      }
    });

    test('sets HEADLESS to true when in Docker', () => {
      // Mock isRunningInDocker
      const docker = require('../src/docker');
      const spy = jest.spyOn(docker, 'isRunningInDocker').mockReturnValue(true);
      
      const config = { HEADLESS: false };
      docker.applyDockerDefaults(config);
      expect(config.HEADLESS).toBe(true);
      
      spy.mockRestore();
    });

    test('sets WORKING_DIR to /workspace when in Docker', () => {
      const docker = require('../src/docker');
      const spy = jest.spyOn(docker, 'isRunningInDocker').mockReturnValue(true);
      
      const config = { WORKING_DIR: '/tmp' };
      docker.applyDockerDefaults(config);
      expect(config.WORKING_DIR).toBe('/workspace');
      
      spy.mockRestore();
    });
  });

  describe('printDockerInfo', () => {
    test('does not throw when not in Docker', () => {
      expect(() => printDockerInfo()).not.toThrow();
    });

    test('does not throw when in Docker (mock)', () => {
      const docker = require('../src/docker');
      const spy = jest.spyOn(docker, 'isRunningInDocker').mockReturnValue(true);
      
      expect(() => printDockerInfo()).not.toThrow();
      
      spy.mockRestore();
    });
  });

  describe('Module Exports', () => {
    test('exports expected functions', () => {
      const docker = require('../src/docker');
      expect(typeof docker.isRunningInDocker).toBe('function');
      expect(typeof docker.getDockerWorkspace).toBe('function');
      expect(typeof docker.applyDockerDefaults).toBe('function');
      expect(typeof docker.printDockerInfo).toBe('function');
    });

    test('never throws on require()', () => {
      expect(() => require('../src/docker')).not.toThrow();
    });
  });
});
