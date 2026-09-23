import type { CompressedSection } from './types.js';

export interface PromptTemplate {
  sections: { kind: string; text: string }[];
}

export function toPromptTemplate(sections: CompressedSection[]): PromptTemplate {
  return { sections: sections.map((s) => ({ kind: s.kind, text: s.after })) };
}

export function toTemplateJson(sections: CompressedSection[]): string {
  return JSON.stringify(toPromptTemplate(sections), null, 2);
}
