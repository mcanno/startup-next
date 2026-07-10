# Carga a rag_chunks: upsert + resync por libro. compute_chunk_id vive
# acá (no en chunking.py/parse) — deliberado, ver chunking.py.

import hashlib
import json
from pathlib import Path

import psycopg


def compute_chunk_id(chunk: dict) -> str:
    path = f"{chunk['libro']}::{chunk['capitulo']}::{chunk['seccion']}::{chunk['indice_en_seccion']}"
    return hashlib.sha256(path.encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    chunks = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                chunks.append(json.loads(line))
    return chunks


def upsert_chunks(conn: psycopg.Connection, chunks: list[dict]) -> set[str]:
    chunk_ids: set[str] = set()
    with conn.cursor() as cur:
        for chunk in chunks:
            chunk_id = compute_chunk_id(chunk)
            chunk_ids.add(chunk_id)
            cur.execute(
                """
                insert into rag_chunks
                    (chunk_id, libro, capitulo, seccion, indice_en_seccion, texto, especialista_tags, embedding, updated_at)
                values
                    (%(chunk_id)s, %(libro)s, %(capitulo)s, %(seccion)s, %(indice_en_seccion)s, %(texto)s, %(especialista_tags)s, %(embedding)s, now())
                on conflict (chunk_id) do update set
                    texto = excluded.texto,
                    especialista_tags = excluded.especialista_tags,
                    embedding = excluded.embedding,
                    updated_at = now()
                """,
                {
                    "chunk_id": chunk_id,
                    "libro": chunk["libro"],
                    "capitulo": chunk["capitulo"],
                    "seccion": chunk["seccion"],
                    "indice_en_seccion": chunk["indice_en_seccion"],
                    "texto": chunk["texto"],
                    "especialista_tags": json.dumps(chunk["especialista_tags"]),
                    "embedding": chunk["embedding"],
                },
            )
    conn.commit()
    return chunk_ids


def resync_book(conn: psycopg.Connection, libro: str, current_chunk_ids: set[str]) -> int:
    with conn.cursor() as cur:
        cur.execute("select chunk_id from rag_chunks where libro = %s", (libro,))
        existing_ids = {row[0] for row in cur.fetchall()}
        orphan_ids = existing_ids - current_chunk_ids
        if orphan_ids:
            cur.execute("delete from rag_chunks where chunk_id = any(%s)", (list(orphan_ids),))
    conn.commit()
    return len(orphan_ids)


def verify_ingestion(conn: psycopg.Connection, libro: str, sample_query_text: str, sample_query_embedding: list[float]) -> None:
    with conn.cursor() as cur:
        cur.execute("select count(*) from rag_chunks where libro = %s", (libro,))
        print(f"{libro}: {cur.fetchone()[0]} chunks cargados")

    with conn.cursor() as cur:
        cur.execute(
            """
            select libro, capitulo, seccion, left(texto, 120)
            from rag_chunks
            where libro = %s
            order by embedding <=> %s::vector
            limit 3
            """,
            (libro, sample_query_embedding),
        )
        print(f'Top 3 resultados para "{sample_query_text}":')
        for row in cur.fetchall():
            print(" -", row)
