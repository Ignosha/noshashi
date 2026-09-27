// Types for kb.js, which the website's NOSHX bundle (src/site/noshx-web.ts) also imports.
export type KbLink = { label: string; href: string };
export type KbEntry = { id: string; keywords: string[]; q: string; a: string; links?: KbLink[] };
export const CONTACT: { support: string; institutions: string; security: string; privacy: string; form: string };
export const ENTRIES: KbEntry[];
export const CONFIDENT: number;
export function search(question: string): Array<{ entry: KbEntry; score: number }>;
export function answer(question: string): {
  grounded: boolean;
  text: string;
  links: KbLink[];
  related?: string[];
  matched: string[];
};
export function asPromptContext(): string;
