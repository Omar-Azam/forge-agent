// tests/examples.test.js — Test suite for Forge Agent example registry
'use strict';

const fs = require('fs');
const path = require('path');
const { 
  EXAMPLES, 
  getExample, 
  listExamples, 
  getCategories, 
  getDifficulties, 
  formatExampleCard, 
  formatExampleList 
} = require('../src/examples');

describe('Example Projects Registry', () => {

  test('EXAMPLES array is exported from src/examples.js', () => {
    expect(Array.isArray(EXAMPLES)).toBe(true);
  });

  test('EXAMPLES array has exactly 10 items', () => {
    expect(EXAMPLES.length).toBe(10);
  });

  test('Every example has required fields', () => {
    EXAMPLES.forEach(example => {
      expect(example).toHaveProperty('id');
      expect(example).toHaveProperty('title');
      expect(example).toHaveProperty('description');
      expect(example).toHaveProperty('category');
      expect(example).toHaveProperty('difficulty');
      expect(example).toHaveProperty('task');
      expect(example).toHaveProperty('expectedFiles');
      expect(example).toHaveProperty('techStack');
      expect(example).toHaveProperty('estimatedTime');
      expect(example).toHaveProperty('profile');
    });
  });

  test('Every example id matches /^[a-z0-9-]+$/ pattern', () => {
    EXAMPLES.forEach(example => {
      expect(example.id).toMatch(/^[a-z0-9-]+$/);
    });
  });

  test('Every example task string is longer than 100 characters', () => {
    EXAMPLES.forEach(example => {
      expect(example.task.length).toBeGreaterThan(100);
    });
  });

  test('Every example has non-empty techStack and expectedFiles arrays', () => {
    EXAMPLES.forEach(example => {
      expect(Array.isArray(example.techStack)).toBe(true);
      expect(example.techStack.length).toBeGreaterThan(0);
      expect(Array.isArray(example.expectedFiles)).toBe(true);
      expect(example.expectedFiles.length).toBeGreaterThan(0);
    });
  });

  test('Every example difficulty is valid', () => {
    const valid = ['beginner', 'intermediate', 'advanced'];
    EXAMPLES.forEach(example => {
      expect(valid).toContain(example.difficulty);
    });
  });

  test('Every example category is valid', () => {
    const valid = ['backend', 'frontend', 'data-science', 'devops'];
    EXAMPLES.forEach(example => {
      expect(valid).toContain(example.category);
    });
  });

  test('No two examples have the same id', () => {
    const ids = EXAMPLES.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('getExample returns correct example by id', () => {
    const ex = getExample('express-rest-api');
    expect(ex).not.toBeNull();
    expect(ex.id).toBe('express-rest-api');
    expect(ex.title).toContain('Express REST API');
  });

  test('getExample returns null for nonexistent id', () => {
    expect(getExample('nonexistent')).toBeNull();
    expect(getExample(null)).toBeNull();
  });

  test('listExamples returns all 10 examples by default', () => {
    expect(listExamples().length).toBe(10);
  });

  test('listExamples filters by category', () => {
    const backend = listExamples({ category: 'backend' });
    expect(backend.length).toBeGreaterThan(0);
    backend.forEach(e => expect(e.category).toBe('backend'));
  });

  test('listExamples filters by difficulty', () => {
    const beginner = listExamples({ difficulty: 'beginner' });
    expect(beginner.length).toBeGreaterThan(0);
    beginner.forEach(e => expect(e.difficulty).toBe('beginner'));
  });

  test('listExamples filters by search term', () => {
    const results = listExamples({ search: 'docker' });
    expect(results.length).toBeGreaterThan(0);
    results.forEach(e => {
      const match = e.title.toLowerCase().includes('docker') || 
                    e.description.toLowerCase().includes('docker') ||
                    e.tags.some(t => t.includes('docker'));
      expect(match).toBe(true);
    });
  });

  test('listExamples returns empty array for no matches', () => {
    expect(listExamples({ search: 'xyz_no_match_123' })).toEqual([]);
  });

  test('getCategories returns correct categories', () => {
    const cats = getCategories();
    expect(cats).toContain('backend');
    expect(cats).toContain('frontend');
    expect(cats).toContain('devops');
    expect(cats).toContain('data-science');
  });

  test('getDifficulties returns correct difficulties', () => {
    expect(getDifficulties()).toEqual(['beginner', 'intermediate', 'advanced']);
  });

  test('formatExampleCard returns a valid string containing title and category', () => {
    const ex = EXAMPLES[0];
    const card = formatExampleCard(ex);
    expect(typeof card).toBe('string');
    expect(card).toContain(ex.title);
    expect(card).toContain(ex.category);
  });

  test('formatExampleCard handles null input gracefully', () => {
    expect(formatExampleCard(null)).toBe('');
  });

  test('formatExampleList returns a numbered list', () => {
    const list = formatExampleList(EXAMPLES.slice(0, 2));
    expect(list).toContain('[1]');
    expect(list).toContain('[2]');
    expect(list).toContain('⭐');
  });

  test('formatExampleList handles empty array', () => {
    expect(formatExampleList([])).toBe('No examples found.');
  });

  test('docs/examples.html exists and contains express-rest-api', () => {
    const htmlPath = path.join(__dirname, '../docs/examples.html');
    if (fs.existsSync(htmlPath)) {
      const content = fs.readFileSync(htmlPath, 'utf8');
      expect(content).toContain('express-rest-api');
    }
  });

});
