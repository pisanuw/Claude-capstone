import { describe, expect, it } from 'vitest';
import { concept, kindStem, numberedItems, numberedKinds, stem, terms } from '../src/core/terms.js';

describe('stem', () => {
  it('joins common inflections', () => {
    expect(stem('submissions')).toBe(stem('submission'));
    expect(stem('policies')).toBe('policy');
    expect(stem('classes')).toBe('class');
    expect(stem('boxes')).toBe('box');
    expect(stem('graded')).toBe(stem('grade'));
    expect(stem('grading')).toBe(stem('grade'));
    expect(stem('dropped')).toBe(stem('drop'));
    expect(stem('broken')).toBe('break');
    expect(stem('Student\'s')).toBe('student');
    expect(stem('quickly')).toBe('quick');
    expect(stem('bus')).toBe('bus');
    expect(stem('12')).toBe('12');
  });
});

describe('concept', () => {
  it('maps synonyms and word families onto one concept', () => {
    expect(concept(stem('ChatGPT'))).toBe('ai');
    expect(concept(stem('Copilot'))).toBe('ai');
    expect(concept(stem('collaborating'))).toBe('collab');
    expect(concept(stem('midterm'))).toBe('exam');
    expect(concept(stem('permitted'))).toBe('allow');
    expect(concept(stem('banana'))).toBeUndefined();
  });
});

describe('numbered items', () => {
  it('reads single numbers, ranges, lists and open-ended mentions', () => {
    expect(numberedItems('Can I use AI on lab 3?')).toEqual(['lab#3']);
    expect(numberedItems('allowed on labs 1 to 4')).toEqual(['lab#1', 'lab#2', 'lab#3', 'lab#4']);
    expect(numberedItems('Labs 1–3')).toEqual(['lab#1', 'lab#2', 'lab#3']);
    expect(numberedItems('homework 2, 3 and 5; HW #7')).toEqual(['homework#2', 'homework#3', 'homework#5', 'homework#7']);
    expect(numberedItems('from lab 5 onward').length).toBe(16);
    expect(numberedItems('A1 and a 2')).toEqual(['assignment#1']);
    expect(numberedItems('CS 142 in room 204')).toEqual([]);
    expect(numberedItems('weeks 9-2')).toEqual([]);
  });

  it('knows kinds and their stems', () => {
    expect([...numberedKinds('the labs and the projects')].sort()).toEqual(['lab', 'project']);
    expect(kindStem('project#2')).toBe('project');
  });
});

describe('terms', () => {
  it('drops stop words and bare numbers, adds concepts and items', () => {
    expect(terms('Can I use ChatGPT on lab 3?')).toEqual(['use', 'chatgpt', '~ai', 'lab', 'lab#3']);
    expect(terms('the of and 42')).toEqual([]);
  });
});
