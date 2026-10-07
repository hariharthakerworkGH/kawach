/* A real PDF file, written by hand: no library, nothing loaded.
 *
 * Just what a report needs: A4 pages, two standard fonts (Helvetica and its
 * bold, which every PDF reader has, so nothing is embedded), text, rules, grey
 * and black ink, and a repeated header row. Those fonts have no ₹ sign, so
 * money in a PDF reads "Rs 12,345", the way it has always been written on
 * paper for an accountant. Anything else the fonts cannot draw (another
 * script) comes out as "?" rather than a broken file.
 */

// Helvetica's widths in 1/1000 of the font size, for the printable ASCII range from the space.
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

/* What the standard fonts can show: the text as Latin-1, "Rs" for the rupee sign. */
export function pdfSafe(text) {
  return String(text ?? '')
    .replace(/₹\s?/g, 'Rs ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[^ -~ -ÿ]/g, '?');
}

export function textWidth(text, size, bold = false) {
  const table = bold ? BOLD : REGULAR;
  let w = 0;
  for (const ch of pdfSafe(text)) {
    const code = ch.charCodeAt(0);
    w += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (w * size) / 1000;
}

/* The longest start of `text` that fits `width`, ending in "..." when it was cut. */
export function fit(text, width, size, bold = false) {
  const s = pdfSafe(text);
  if (textWidth(s, size, bold) <= width) return s;
  let out = s;
  while (out.length > 1 && textWidth(`${out}...`, size, bold) > width) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

/* `text` broken into lines no wider than `width`, at most `max` of them (the last one cut with "..."). */
export function wrap(text, width, size, max = 2, bold = false) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= width) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
      // one word wider than the column: cut it
      if (textWidth(line, size, bold) > width) line = fit(line, width, size, bold);
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const rest = lines.slice(max - 1).join(' ');
    return [...lines.slice(0, max - 1), fit(rest, width, size, bold)];
  }
  return lines.length ? lines : [''];
}

const escape = (s) => pdfSafe(s).replace(/([\\()])/g, '\\$1');
const num = (n) => (Math.round(n * 100) / 100).toString();

export const A4 = { w: 595.28, h: 841.89 };

/* A document is built page by page. Coordinates run from the top left, in points. */
export function createPdf({ title = '', author = 'Kawach' } = {}) {
  const pages = [];
  let ops = null;
  const doc = {
    get pageCount() {
      return pages.length;
    },
    newPage() {
      ops = [];
      pages.push(ops);
      return pages.length;
    },
    /* align: 'left' | 'right' | 'center' (x is then the right edge or the middle) */
    text(x, y, str, { size = 10, bold = false, gray = 0, align = 'left' } = {}) {
      const s = pdfSafe(str);
      const w = textWidth(s, size, bold);
      const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(gray)} g ${num(left)} ${num(A4.h - y)} Td (${escape(s)}) Tj ET`);
    },
    rule(x1, y, x2, { gray = 0.75, width = 0.5 } = {}) {
      ops.push(`${num(gray)} G ${num(width)} w ${num(x1)} ${num(A4.h - y)} m ${num(x2)} ${num(A4.h - y)} l S`);
    },
    fill(x, y, w, h, gray) {
      ops.push(`${num(gray)} g ${num(x)} ${num(A4.h - y - h)} ${num(w)} ${num(h)} re f`);
    },
    /* The file, as bytes. Page numbers are added by `footer` before this. */
    finish() {
      const objects = [];
      const add = (body) => {
        objects.push(body);
        return objects.length;
      };
      add('<< /Type /Catalog /Pages 2 0 R >>');
      add(''); // Pages, filled in below
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const pageIds = [];
      for (const p of pages) {
        const stream = p.join('\n');
        const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`));
      }
      objects[1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
      const infoId = add(`<< /Title (${escape(title)}) /Producer (${escape(author)}) /Creator (${escape(author)}) >>`);
      // Everything is Latin-1, one byte a character, so offsets are string lengths.
      let out = '%PDF-1.4\n%âãÏÓ\n';
      const offsets = [];
      objects.forEach((body, i) => {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
      });
      const xref = out.length;
      out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
      out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    },
    /* Runs `draw(pageNumber, pageCount)` on every page, for a footer. */
    eachPage(draw) {
      const saved = ops;
      pages.forEach((p, i) => {
        ops = p;
        draw(i + 1, pages.length);
      });
      ops = saved;
    },
  };
  return doc;
}
