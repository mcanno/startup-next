import { sql } from "drizzle-orm";
import { db } from "./index.js";

export type RetrievedChunk = {
  chunkId: string;
  libro: string;
  capitulo: string | null;
  seccion: string | null;
  texto: string;
};

// Búsqueda por similitud con SQL crudo: drizzle-orm@0.45 no trae un
// helper de distancia (cosineDistance, etc.) para la columna vector
// nativa, así que se arma a mano con el operador `<=>` (distancia
// coseno) — el embedding de la consulta va bindeado como parámetro, no
// interpolado crudo. Filtra por especialista_tags antes de ordenar por
// similitud, para que cada especialista consulte solo su porción del
// corpus (sección 4).
export async function searchRagChunks(
  queryEmbedding: number[],
  especialista: string,
  limit = 5,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  const tagsLiteral = JSON.stringify([especialista]);

  const result = await db.execute<{
    chunk_id: string;
    libro: string;
    capitulo: string | null;
    seccion: string | null;
    texto: string;
  }>(sql`
    select chunk_id, libro, capitulo, seccion, texto
    from rag_chunks
    where especialista_tags @> ${tagsLiteral}::jsonb
    order by embedding <=> ${vectorLiteral}::vector
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    chunkId: row.chunk_id,
    libro: row.libro,
    capitulo: row.capitulo,
    seccion: row.seccion,
    texto: row.texto,
  }));
}
