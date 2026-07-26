#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Pipeline de Processamento de Imagens com IA Local (rembg + Pillow)
PaletScan ETL - Módulo de Remoção de Fundo e Otimização de Imagens
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image
try:
    from rembg import remove, new_session
except ImportError:
    print("Aviso: 'rembg' não está instalado no ambiente Python atual. Execute 'pip install rembg pillow'.")
    remove = None
    new_session = None

# Diretórios padrão
BASE_DIR = Path(__file__).resolve().parent.parent.parent
RAW_DIR = BASE_DIR / "images" / "raw"
PROCESSED_DIR = BASE_DIR / "images" / "processed"

def process_single_image(input_path: str, output_path: str = None, alpha_matting: bool = True) -> str:
    """
    Processa uma única imagem: remove o fundo utilizando rembg (IA local)
    e salva o resultado otimizado em formato .webp transparente na pasta images/processed.
    """
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"Arquivo de imagem não encontrado: {input_path}")

    # Garante que o diretório de destino existe
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    # Define o nome do arquivo de saída em formato .webp
    if output_path is None:
        stem = input_file.stem
        output_file = PROCESSED_DIR / f"{stem}.webp"
    else:
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

    print(f"📷 Lendo imagem: {input_file}")
    image = Image.open(input_file).convert("RGBA")

    # Remoção de fundo usando IA rembg (se disponível)
    if remove is not None:
        print("🤖 Removendo fundo com IA local (rembg)...")
        # Utiliza u2net ou isnet-general-use por padrão
        session = new_session("u2net")
        output_image = remove(image, session=session, alpha_matting=alpha_matting)
    else:
        print("⚠️ rembg ausente: Otimizando imagem mantendo fundo original.")
        output_image = image

    # Otimização para formato WebP com canal Alpha (transparência)
    print(f"💾 Salvando imagem otimizada (.webp): {output_file}")
    output_image.save(output_file, format="WEBP", quality=90, method=6)

    return str(output_file)

def batch_process_directory(input_dir: str):
    """
    Processa em lote todas as imagens de um diretório.
    """
    dir_path = Path(input_dir)
    valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    images = [p for p in dir_path.glob("*") if p.suffix.lower() in valid_exts]

    print(f"📦 Encontradas {len(images)} imagens em {input_dir}")
    processed_files = []

    for img_path in images:
        try:
            res = process_single_image(str(img_path))
            processed_files.append(res)
        except Exception as e:
            print(f"❌ Erro ao processar {img_path.name}: {e}")

    return processed_files

def main():
    parser = argparse.ArgumentParser(
        description="Pipeline de IA local para remoção de fundo e conversão para WebP."
    )
    parser.add_argument("input_path", nargs="?", help="Caminho da imagem de entrada ou diretório")
    parser.add_argument("-o", "--output", help="Caminho do arquivo de saída .webp")
    parser.add_argument("--batch", action="store_true", help="Processar diretório completo")

    args = parser.parse_args()

    if not args.input_path:
        # Se nenhum argumento for passado, tenta ler imagens em images/raw
        if RAW_DIR.exists() and any(RAW_DIR.iterdir()):
            print(f"Nenhum caminho informado. Processando pasta padrão: {RAW_DIR}")
            batch_process_directory(str(RAW_DIR))
            sys.exit(0)
        else:
            print("Uso: python process_image.py <caminho_imagem_ou_diretorio> [-o saída.webp]")
            sys.exit(1)

    input_path = Path(args.input_path)

    if args.batch or input_path.is_dir():
        batch_process_directory(str(input_path))
    else:
        process_single_image(str(input_path), args.output)

if __name__ == "__main__":
    main()
