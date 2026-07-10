# Chunking por sección real (no por tamaño fijo de caracteres), preservando
# libro/capitulo/seccion. Trasladado tal cual del notebook original
# (sección 4) — compute_chunk_id vive en load.py, no acá (se calcula en
# `load`, no en `parse`, para poder cambiar el algoritmo del hash sin
# volver a pagar el parseo con MinerU).


def chunk_by_section(blocks: list[dict], libro: str) -> list[dict]:
    chunks: list[dict] = []
    capitulo: str | None = None
    seccion: str | None = None
    buffer: list[str] = []
    seen_indices: dict[tuple, int] = {}

    def flush():
        texto = "\n".join(buffer).strip()
        buffer.clear()
        if not texto:
            return
        key = (capitulo, seccion)
        indice = seen_indices.get(key, 0)
        seen_indices[key] = indice + 1
        chunks.append({
            "libro": libro,
            "capitulo": capitulo,
            "seccion": seccion,
            "indice_en_seccion": indice,
            "texto": texto,
        })

    for block in blocks:
        text_level = block.get("text_level")

        if text_level == 1:
            flush()
            capitulo = block.get("text", "").strip()
            seccion = None
            continue
        if text_level == 2:
            flush()
            seccion = block.get("text", "").strip()
            continue
        if text_level and text_level > 2:
            # subtítulos más profundos: parte de la sección vigente, no
            # ameritan otro nivel en el esquema libro/capitulo/seccion.
            buffer.append(block.get("text", ""))
            continue

        if block.get("type") == "text":
            buffer.append(block.get("text", ""))

    flush()
    return chunks
