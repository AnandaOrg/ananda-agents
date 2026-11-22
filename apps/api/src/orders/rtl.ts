// Right-to-left text for PDFs. pdfkit lays out each fragment with fontkit, which reverses a whole
// fragment and mirrors its brackets when the fragment starts with Hebrew, and leaves it alone otherwise.
// It does not order words. So:
//  1. wrap in logical order (reordering a whole paragraph would reverse the line order);
//  2. put each line into visual order with the Unicode Bidirectional Algorithm (bidi-js): word order,
//     numbers and Latin names kept left to right, brackets mirrored;
//  3. draw word by word; a word containing Hebrew is handed back in logical order (unreversed,
//     brackets unmirrored), because fontkit reverses and mirrors it again.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bidiFactory = require('bidi-js') as () => {
  getEmbeddingLevels(text: string, direction: 'ltr' | 'rtl'): { levels: Uint8Array; paragraphs: { start: number; end: number; level: number }[] };
  getReorderedString(text: string, levels: unknown): string;
};

const bidi = bidiFactory();
// Bidi isolates (used to keep amounts left-to-right in the web UI) have no glyph in the PDF font.
const ISOLATES = /[⁦-⁩]/g;

/** One line of logical text → the order its glyphs are drawn in, for a right-to-left paragraph. */
export function visualRtl(line: string): string {
  // Isolates (U+2066–2069) keep amounts and references left to right; they are honoured here and then
  // dropped, as they have no glyph in the PDF font.
  const text = line;
  // Reorders runs and mirrors brackets in one step.
  return bidi.getReorderedString(text, bidi.getEmbeddingLevels(text, 'rtl')).replace(ISOLATES, '');
}

/** Greedy word wrap in logical order, measured with the document's current font and size. */
export function wrapLines(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  const width_ = (s: string) => measure(s.replace(ISOLATES, ''));
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && width_(next) > width) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const HEBREW = /[\u0590-\u05FF]/;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

/** A line split into the fragments to draw left to right, for a right-to-left paragraph. */
export function rtlFragments(line: string): string[] {
  return visualRtl(line)
    .split(' ')
    .filter((w) => w.length)
    .map((w) => (HEBREW.test(w) ? w.split('').reverse().map((c) => MIRROR[c] ?? c).join('') : w));
}
