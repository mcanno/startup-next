# rag-ingest — ingesta offline del corpus del RAG (sección 4 de
# diseno_startup_next.md). Contenedor independiente, invocado a mano;
# NO es un endpoint de startup-next ni corre en producción.
#
# Uso:
#   docker build -t rag-ingest .
#   docker run --rm --env-file .env \
#     -v "$(pwd)/sources:/app/sources" -v "$(pwd)/out:/app/out" \
#     rag-ingest parse --file sources/libro.pdf --libro "Nombre" --tags mvp --out out/libro.jsonl
#   docker run --rm --env-file .env \
#     -v "$(pwd)/out:/app/out" \
#     rag-ingest load --file out/libro.jsonl

FROM python:3.12-slim

WORKDIR /app

# Límite de threads nativos: sin esto, torch + onnxruntime + opencv-python
# compartiendo el mismo proceso de inferencia CPU crasheó con
# "free(): invalid pointer" en la sesión real de ingesta (sección 4).
# Se fija como ENV de imagen, no dentro del script Python — se aplica
# antes de que el intérprete arranque siquiera.
ENV OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

# libgl1/libglib2.0-0: opencv-python (dependencia de mineru) falla al
# importar en imágenes Debian "slim" sin estas librerías del sistema
# (ImportError: libGL.so.1). pypdfium2 (renderizado de PDF) no necesita
# nada extra — trae binarios propios.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# torch/torchvision CPU-only, ANTES de mineru[pipeline] — por defecto
# (backend=pipeline, sin GPU) mineru arrastra el wheel GPU de torch desde
# PyPI (varios GB de paquetes nvidia_* nunca usados, ver ENV de threads
# arriba: esta imagen fuerza CPU de todos modos). Instalarlo primero
# funciona porque el "upgrade-strategy" por defecto de pip es
# "only-if-needed": si torch ya instalado satisface el rango que pide
# mineru, el --upgrade de abajo no lo toca ni lo reemplaza.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# mineru[pipeline] --upgrade resuelve transformers/huggingface-hub en el
# rango correcto de una sola vez (MinerU los declara en su pyproject.toml;
# sin este pin, el backend pipeline falla al inicializar el modelo de
# fórmulas con ImportError: cannot import name
# 'find_pruneable_heads_and_indices' contra transformers 5.x) — no fijar
# cada librería por separado.
RUN pip install --no-cache-dir "mineru[pipeline]" --upgrade

# six: el backend pipeline (OCR adaptado de PaddleOCR) lo importa en
# tiempo de ejecución pero no queda declarado como dependencia resuelta
# de mineru[pipeline] — sin esto, falla en el primer parse real con
# ModuleNotFoundError: No module named 'six'.
RUN pip install --no-cache-dir voyageai "psycopg[binary]" pgvector click six

# Modelos de layout/OCR/fórmulas bakeados en build time — elimina la
# descarga en caliente y el problema de certificados SSL contra
# huggingface.co ya diagnosticado en la sesión real de ingesta. -s
# modelscope explícito (no "auto"), mismo motivo.
RUN mineru-models-download -s modelscope -m pipeline

COPY rag_ingest/ ./rag_ingest/

ENTRYPOINT ["python", "-m", "rag_ingest.cli"]
