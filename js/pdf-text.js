import * as pdfjsLib from './vendor/pdf.min.js';

// Relative to THIS module, not to whichever page imported it. As a bare
// './pdf.worker.min.js' the browser resolved it against the page - so the
// app asked for /pdf.worker.min.js, got a 404, and pdf.js quietly fell back
// to reading on the main thread. That fallback opens small files and then
// stalls or fails on a real statement, which is why a card PDF could end in
// a blank review with nothing said.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;

export class PdfPasswordError extends Error {
  constructor(kind) {
    super(`PDF requires a password (${kind})`);
    this.kind = kind; // 'required' | 'incorrect'
  }
}

export class PdfNoTextError extends Error {
  // The plain cause and the way out, in the person's words: this message is
  // shown on Import as it is (design.md section 12). No jargon, no code.
  constructor() {
    super('There is no text in this PDF, so it is probably a scan or a photo. Download the statement from your bank as a spreadsheet (CSV) and choose that instead.');
  }
}

/* Is this pdf.js complaining about a password, and which complaint?
 *
 * Exported so it can be tested without an encrypted file to hand. pdf.js
 * reports these as a PasswordException, but the name does not survive every
 * minified build; the codes do - 1 means one is needed, 2 means the one
 * given was wrong. The message is checked last so a build that changes both
 * still gets classified rather than falling through to "couldn't read this
 * file", which told the person nothing about what to do next.
 *
 * Returns 'required', 'incorrect', or null when it is some other failure.
 */
export function passwordErrorKind(err) {
  if (!err) return null;
  const name = err.name || '';
  const message = err.message || '';
  const code = err.code;
  const isPassword = name === 'PasswordException' || code === 1 || code === 2 || /password/i.test(message);
  if (!isPassword) return null;
  return code === 2 || /incorrect|invalid|wrong/i.test(message) ? 'incorrect' : 'required';
}

export async function extractPdfText(file, password) {
  const arrayBuffer = await file.arrayBuffer();
  const params = { data: arrayBuffer };
  if (password) params.password = password;

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(params).promise;
  } catch (err) {
    const kind = passwordErrorKind(err);
    if (kind) throw new PdfPasswordError(kind);
    throw err;
  }

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += reconstructLines(content.items) + '\n';
  }

  if (!fullText.replace(/\s+/g, '').length) {
    throw new PdfNoTextError();
  }

  return fullText;
}

function reconstructLines(items) {
  const Y_TOLERANCE = 2;
  const rows = [];

  for (const item of items) {
    if (!item.str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, width: item.width || 0, str: item.str });
  }

  rows.sort((a, b) => b.y - a.y);

  return rows
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      for (const it of row.items) {
        if (prevEnd !== null && it.x - prevEnd > 1.5) line += ' ';
        line += it.str;
        prevEnd = it.x + it.width;
      }
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');
}
