# Corre MinerU (backend pipeline, sin VLM) sobre un PDF y lee su salida
# estructurada. Lógica trasladada del notebook original (sección 4),
# adaptada a Linux (el notebook corría en Windows, buscaba mineru.exe).

import json
import subprocess
import sys
from pathlib import Path


def run_mineru(pdf_path: Path, output_dir: Path) -> Path:
    """Corre MinerU sobre un PDF y devuelve la ruta al content_list.json resultante."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Ruta absoluta al ejecutable del mismo entorno Python que corre este
    # script, no el nombre bare "mineru" (dependía de PATH en el notebook
    # original en Windows; acá no hay venv que activar, pero se mantiene
    # el mismo criterio explícito).
    mineru_exe = Path(sys.executable).parent / "mineru"
    subprocess.run(
        [str(mineru_exe), "-p", str(pdf_path), "-o", str(output_dir), "-b", "pipeline"],
        check=True,
    )

    content_list_files = list(output_dir.rglob(f"{pdf_path.stem}*content_list.json"))
    if not content_list_files:
        raise FileNotFoundError(f"MinerU no generó content_list.json para {pdf_path}")
    return content_list_files[0]


def load_content_blocks(content_list_path: Path) -> list[dict]:
    with open(content_list_path, encoding="utf-8") as f:
        return json.load(f)
