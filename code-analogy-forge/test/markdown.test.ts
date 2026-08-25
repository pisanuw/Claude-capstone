import { describe, expect, it } from 'vitest';
import { analogyToMarkdown } from '../src/core/markdown';

describe('analogyToMarkdown', () => {
  it('renders a heading, audience line, body, and mapping table', () => {
    const md = analogyToMarkdown('recursion--cooking', 'undergrad');
    expect(md).not.toBeNull();
    expect(md).toContain('### Recursion: Sourdough starter feeding on itself');
    expect(md).toContain('written for a cs undergraduate');
    expect(md).toContain('| In the code | In the analogy |');
    expect(md).toContain('| base case |');
    expect(md).toContain('Sourdough separates');
  });

  it('uses the audience variant that was asked for', () => {
    const child = analogyToMarkdown('stack--restaurant', 'child');
    const adult = analogyToMarkdown('stack--restaurant', 'adult');
    expect(child).not.toBe(adult);
    expect(child).toContain('pile of plates');
  });

  it('appends a personal note as a blockquote', () => {
    const md = analogyToMarkdown('queue--travel', 'adult', 'Use this in the ops onboarding doc.');
    expect(md).toContain('> Use this in the ops onboarding doc.');
  });

  it('skips empty notes', () => {
    const md = analogyToMarkdown('queue--travel', 'adult', '   ');
    expect(md).not.toContain('\n> ');
  });

  it('returns null for unknown analogies', () => {
    expect(analogyToMarkdown('nope--nope', 'child')).toBeNull();
  });
});
