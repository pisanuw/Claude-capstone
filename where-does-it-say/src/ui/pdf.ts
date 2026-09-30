/** PDF text extraction in the browser with pdf.js, loaded only when a PDF is added. */

import { pdfItemsToText, type PdfItem } from '../core/pdftext.js';

export async function extractPdfText(data: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  const pages: PdfItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const t = it.transform as number[];
      items.push({ str: it.str, x: t[4], y: t[5], h: it.height || Math.hypot(t[2], t[3]), hasEOL: it.hasEOL });
    }
    pages.push(items);
    page.cleanup();
  }
  const pageCount = doc.numPages;
  await task.destroy();
  return { text: pdfItemsToText(pages), pages: pageCount };
}
