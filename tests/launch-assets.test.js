// tests/launch-assets.test.js
'use strict';

const { 
  PRODUCT_HUNT_TAGLINE, 
  PRODUCT_HUNT_DESCRIPTION, 
  HACKER_NEWS_TITLE,
  generateHackerNewsPost,
  TWITTER_THREAD,
  LINKEDIN_POST,
  DEV_TO_POST,
  generateLaunchKit,
  formatLaunchAsset,
  formatAllLaunchAssets
} = require('../src/launch-assets');

describe('Launch Assets Generator', () => {

  test('PRODUCT_HUNT_TAGLINE is valid', () => {
    expect(typeof PRODUCT_HUNT_TAGLINE).toBe('string');
    expect(PRODUCT_HUNT_TAGLINE.length).toBeLessThanOrEqual(60);
  });

  test('PRODUCT_HUNT_DESCRIPTION is valid', () => {
    expect(typeof PRODUCT_HUNT_DESCRIPTION).toBe('string');
    const wordCount = PRODUCT_HUNT_DESCRIPTION.split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(150);
    expect(wordCount).toBeLessThanOrEqual(400);
  });

  test('HACKER_NEWS_TITLE is valid', () => {
    expect(typeof HACKER_NEWS_TITLE).toBe('string');
    expect(HACKER_NEWS_TITLE.length).toBeLessThanOrEqual(80);
    expect(HACKER_NEWS_TITLE).toContain('Show HN');
  });

  test('generateHackerNewsPost returns valid content', () => {
    const post = generateHackerNewsPost();
    expect(typeof post).toBe('string');
    expect(post).toContain('Forge Agent');
    expect(post).toContain('https://github.com/Omar-Azam/forge-agent');
  });

  test('TWITTER_THREAD has exactly 7 valid tweets', () => {
    expect(Array.isArray(TWITTER_THREAD)).toBe(true);
    expect(TWITTER_THREAD.length).toBe(7);
    TWITTER_THREAD.forEach(tweet => {
      expect(tweet.length).toBeLessThanOrEqual(280);
    });
    expect(TWITTER_THREAD[0].toLowerCase()).toMatch(/api key|free/);
  });

  test('LINKEDIN_POST is valid', () => {
    expect(typeof LINKEDIN_POST).toBe('string');
    const wordCount = LINKEDIN_POST.split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(150);
    expect(LINKEDIN_POST).toContain('forge-agent');
  });

  test('DEV_TO_POST is valid markdown', () => {
    expect(typeof DEV_TO_POST).toBe('string');
    expect(DEV_TO_POST).toContain('## ');
    expect(DEV_TO_POST).toContain('forge-agent --setup');
  });

  test('generateLaunchKit returns object with all platforms', () => {
    const kit = generateLaunchKit();
    expect(kit).toHaveProperty('productHunt');
    expect(kit).toHaveProperty('hackerNews');
    expect(kit).toHaveProperty('twitter');
    expect(kit).toHaveProperty('linkedin');
    expect(kit).toHaveProperty('devTo');
  });

  test('formatLaunchAsset returns non-empty string', () => {
    const asset = formatLaunchAsset('test', 'content');
    expect(typeof asset).toBe('string');
    expect(asset.length).toBeGreaterThan(0);
    expect(asset).toContain('TEST');
  });

  test('formatAllLaunchAssets returns string with all platform names', () => {
    const all = formatAllLaunchAssets();
    expect(all).toContain('PRODUCTHUNT');
    expect(all).toContain('HACKERNEWS');
    expect(all).toContain('TWITTER');
    expect(all).toContain('LINKEDIN');
    expect(all).toContain('DEVTO');
  });
});
