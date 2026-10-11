/* What a statement reader is given (5.43.1).
 *
 * The readers use patterns that look along a line. On a line that is absurdly long, or a run of digits that
 * goes on for ever (a scanned page read as garbage, a barcode), those patterns slow to a crawl: a 200,000-digit
 * run held one reader for 43 seconds and the page with it. Nothing a real statement contains looks like that, so
 * the text is tidied first: lines cut to a believable length, and long runs of digits shortened. A file that is
 * simply too big is refused with a plain sentence instead of being tried. */

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_CSV_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT_CHARS = 4 * 1024 * 1024;
const MAX_LINE = 1200;
const MAX_RUN = 40;

export class TooBigError extends Error {}

/* A sentence when the file is too big to read, else null. */
export function sizeProblem(file) {
  const mb = (n) => Math.round(n / 1024 / 1024);
  const isPdf = !/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/i.test(file.type);
  const limit = isPdf ? MAX_PDF_BYTES : MAX_CSV_BYTES;
  return file.size > limit ? `That file is ${mb(file.size)} MB. Kawach reads statements up to ${mb(limit)} MB. Download the statement for a shorter period and try again.` : null;
}

export function cleanStatementText(text) {
  const t = String(text == null ? '' : text);
  if (t.length > MAX_TEXT_CHARS) throw new TooBigError('That statement has more text than Kawach can read at once. Download a shorter period and try again.');
  return t
    .split('\n')
    .map((line) => (line.length > MAX_LINE ? line.slice(0, MAX_LINE) : line))
    .join('\n')
    .replace(new RegExp(`\\d{${MAX_RUN + 1},}`, 'g'), (run) => run.slice(0, MAX_RUN));
}
