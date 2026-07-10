# Entry point de rag-ingest: dos subcomandos (parse, load) de la misma
# imagen — separar "generar" de "cargar" (sección 4). Click: ya es
# dependencia transitiva de mineru[pipeline], no suma librería nueva.

import json
from pathlib import Path

import click

from .chunking import chunk_by_section
from .db import get_connection
from .load import read_jsonl, resync_book, upsert_chunks, verify_ingestion
from .mineru_runner import load_content_blocks, run_mineru
from .voyage_client import embed_documents, embed_query, get_client

SAMPLE_QUERY = "cómo validar una hipótesis de valor"


@click.group()
def cli():
    """rag-ingest: ingesta offline del corpus del RAG de Startup-Next."""


@cli.command()
@click.option("--file", "pdf_file", required=True, type=click.Path(exists=True, path_type=Path), help="PDF de origen.")
@click.option("--libro", required=True, help="Nombre del libro (ej. 'Lean Startup').")
@click.option("--tags", required=True, help="especialista_tags separados por coma (ej. mvp).")
@click.option("--out", "out_file", required=True, type=click.Path(path_type=Path), help="Ruta del .jsonl de salida.")
def parse(pdf_file: Path, libro: str, tags: str, out_file: Path):
    """Parsea un PDF con MinerU, trocea por sección y embebe con Voyage — escribe un .jsonl, no toca la base."""
    especialista_tags = [t.strip() for t in tags.split(",") if t.strip()]

    click.echo(f"Parseando {pdf_file} con MinerU (backend pipeline)...")
    mineru_output_dir = out_file.parent / f"_mineru_{pdf_file.stem}"
    content_list_path = run_mineru(pdf_file, mineru_output_dir)
    blocks = load_content_blocks(content_list_path)

    chunks = chunk_by_section(blocks, libro)
    click.echo(f"{len(chunks)} chunks generados")
    if not chunks:
        raise click.ClickException("No se generó ningún chunk — revisar el PDF de origen o el parseo de MinerU.")

    client = get_client()
    embeddings = embed_documents(client, [c["texto"] for c in chunks])
    for chunk, embedding in zip(chunks, embeddings):
        chunk["embedding"] = embedding
        chunk["especialista_tags"] = especialista_tags

    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    click.echo(f"Escrito {out_file} ({len(chunks)} chunks)")


@cli.command()
@click.option("--file", "jsonl_file", required=True, type=click.Path(exists=True, path_type=Path), help=".jsonl generado por 'parse'.")
def load(jsonl_file: Path):
    """Carga un .jsonl a rag_chunks: upsert + resync por libro."""
    chunks = read_jsonl(jsonl_file)
    if not chunks:
        raise click.ClickException(f"{jsonl_file} no tiene chunks.")

    libro = chunks[0]["libro"]
    if any(c["libro"] != libro for c in chunks):
        raise click.ClickException("El .jsonl mezcla más de un libro — 'load' espera un libro a la vez.")

    conn = get_connection()
    try:
        current_ids = upsert_chunks(conn, chunks)
        orphans = resync_book(conn, libro, current_ids)
        click.echo(f"{len(current_ids)} chunks upserteados, {orphans} huérfanos eliminados")

        client = get_client()
        sample_embedding = embed_query(client, SAMPLE_QUERY)
        verify_ingestion(conn, libro, SAMPLE_QUERY, sample_embedding)
    finally:
        conn.close()


if __name__ == "__main__":
    cli()
