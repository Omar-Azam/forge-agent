// tests/profiles.test.js — Agent profile unit tests
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProfile, listProfiles, applyProfile, loadCustomProfile, SUPPORTED_PROFILES } = require('../src/profiles');

describe('Agent Profiles', () => {

  test('SUPPORTED_PROFILES is exported and has standard profiles', () => {
    expect(Array.isArray(SUPPORTED_PROFILES)).toBe(true);
    expect(SUPPORTED_PROFILES).toContain('default');
    expect(SUPPORTED_PROFILES).toContain('backend');
    expect(SUPPORTED_PROFILES).toContain('frontend');
    expect(SUPPORTED_PROFILES).toContain('devops');
  });

  test('listProfiles() returns all builtin profiles', () => {
    const all = listProfiles();
    expect(all.length).toBe(SUPPORTED_PROFILES.length);
    expect(all.some(p => p.name === 'default')).toBe(true);
  });

  test('getProfile("default") returns default profile', () => {
    const p = getProfile('default');
    expect(p.name).toBe('default');
  });

  test('getProfile("backend") returns backend profile', () => {
    const p = getProfile('backend');
    expect(p.name).toBe('backend');
    expect(p.planningMode).toBe(true);
  });

  test('getProfile("frontend") returns frontend profile', () => {
    const p = getProfile('frontend');
    expect(p.name).toBe('frontend');
    expect(p.planningMode).toBe(false);
  });

  test('getProfile("data-science") returns data-science profile', () => {
    const p = getProfile('data-science');
    expect(p.name).toBe('data-science');
  });

  test('getProfile("devops") returns devops profile', () => {
    const p = getProfile('devops');
    expect(p.name).toBe('devops');
  });

  test('getProfile is case-insensitive', () => {
    expect(getProfile('BACKEND').name).toBe('backend');
  });

  test('getProfile returns default for null/empty', () => {
    expect(getProfile(null).name).toBe('default');
    expect(getProfile('').name).toBe('default');
  });

  test('getProfile throws for unknown profile', () => {
    expect(() => getProfile('invalid-profile')).toThrow(/Unknown profile/);
  });

  test('applyProfile sets settings correctly', () => {
    const mockConfig = { PLANNING_MODE: false, ACTIVE_PROFILE: 'old' };
    const profile = { name: 'new', planningMode: true };
    const result = applyProfile(profile, mockConfig);
    
    expect(result.PLANNING_MODE).toBe(true);
    expect(result.ACTIVE_PROFILE).toBe('new');
  });

  test('loadCustomProfile returns error for missing file', () => {
    const result = loadCustomProfile('/non/existent/path.json');
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  test('loadCustomProfile loads valid JSON profile', () => {
    const tmpFile = path.join(os.tmpdir(), `forge-profile-${Date.now()}.json`);
    const mockProfile = {
      name: 'custom',
      description: 'Custom desc',
      systemPromptAddition: 'Addition here',
      planningMode: true
    };
    
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(mockProfile));
      const result = loadCustomProfile(tmpFile);
      expect(result.success).toBe(true);
      expect(result.profile.name).toBe('custom');
      expect(result.profile.systemPromptAddition).toBe('Addition here');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  test('backend profile has planningMode true', () => {
    const p = getProfile('backend');
    expect(p.planningMode).toBe(true);
  });

});