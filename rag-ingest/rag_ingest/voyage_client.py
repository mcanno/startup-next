# Embeddings vía el SDK oficial de Python (voyageai) — interfaz distinta
# del cliente REST en src/lib/voyage.ts (usado por el especialista en
# tiempo de ejecución). No asumir que el shape de la respuesta cruda
# ({data: [{embedding}]}, descubierto probando el endpoint REST) aplica
# acá — este SDK expone su propio objeto de respuesta.

import os

import voyageai

VOYAGE_MODEL = "voyage-4"
# Debe coincidir con vector(1024) en la migración 0003_add_rag_chunks.sql
# del servicio Node — mismo espacio vectorial en ambos lados.
EMBEDDING_DIMENSIONS = 1024


def get_client() -> voyageai.Client:
    return voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])


def embed_documents(client: voyageai.Client, texts: list[str], batch_size: int = 64) -> list[list[float]]:
    embeddings: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        result = client.embed(
            texts=batch,
            model=VOYAGE_MODEL,
            input_type="document",
            output_dimension=EMBEDDING_DIMENSIONS,
        )
        embeddings.extend(result.embeddings)
    return embeddings


def embed_query(client: voyageai.Client, text: str) -> list[float]:
    result = client.embed(
        texts=[text],
        model=VOYAGE_MODEL,
        input_type="query",
        output_dimension=EMBEDDING_DIMENSIONS,
    )
    return result.embeddings[0]
