// Extracción de texto plano de PDF para POST /informes/parse (sección 8,
// Pieza A). Los informes que llegan acá los genera startup-advisor —
// documentos simples, no libros escaneados con layout complejo — así que
// alcanza con unpdf (liviano, sin dependencias nativas) en vez de MinerU
// (reservado para el corpus del RAG, ver rag-ingest/).

import { extractText, getDocumentProxy } from "unpdf";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
