// Verificacion de la firma Ed25519 que startup-advisor agrega a los PDF
// de informe exportados (diseno_startup_next.md seccion 9) -- reemplaza
// el startup_id manual: si el PDF es genuinamente de startup-advisor, se
// extrae el startup_id real del propio documento; si no, se degrada a un
// UUID al azar (modo base), sin error y sin bloquear nada, mismo criterio
// de degradacion elegante que el resto del sistema.
//
// unpdf (extractTextFromPdf) aplana los saltos de linea a espacios -- el
// bloque de 6 lineas llega como una sola linea continua. Por eso NO se
// usa texto.split("\n"): se ancla en el marcador y se extrae cada campo
// con una regex, seguro porque ninguno de los 4 valores (dos uuid, un
// ISO8601, un base64) contiene espacios internos.

import { createPublicKey, verify } from "node:crypto";

const MARKER = "startup-next-verification";

function getPublicKey() {
  const pem = process.env.PDF_SIGNING_PUBLIC_KEY;
  if (!pem) throw new Error("PDF_SIGNING_PUBLIC_KEY is not set");
  return createPublicKey(pem.replace(/\\n/g, "\n"));
}

function extractField(texto: string, label: string): string | undefined {
  return texto.match(new RegExp(`${label}:\\s*(\\S+)`))?.[1];
}

export function resolveStartupIdFromPdfText(texto: string): string {
  const markerIdx = texto.indexOf(MARKER);
  if (markerIdx === -1) return crypto.randomUUID();

  const bloque = texto.slice(markerIdx);
  const startupId = extractField(bloque, "startup_id");
  const reportId = extractField(bloque, "report_id");
  const timestamp = extractField(bloque, "timestamp");
  const signature = extractField(bloque, "signature");

  if (!startupId || !reportId || !timestamp || !signature) return crypto.randomUUID();

  const canonical = `${startupId}|${reportId}|${timestamp}`;
  try {
    const valido = verify(null, Buffer.from(canonical, "utf8"), getPublicKey(), Buffer.from(signature, "base64"));
    return valido ? startupId : crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}
