#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Pipeline de Processamento de Imagens com IA Local (rembg + Pillow)
PaletScan ETL - Módulo de Remoção de Fundo, Padronização em Fundo Branco e Otimização WebP
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

def process_single_image(
    input_path: str,
    output_path: str = None,
    alpha_matting: bool = True,
    max_dimension: int = 1000,
    quality: int = 80
) -> str:
    """
    Processa uma única imagem:
    1. Remove o fundo utilizando rembg (IA local se disponível).
    2. Compõe a imagem tratada sobre um fundo branco sólido (RGB).
    3. Redimensiona preservando proporções se exceder max_dimension.
    4. Salva em .webp otimizado (< 100-150KB) sem perder nitidez visual.
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
        session = new_session("u2net")
        raw_cutout = remove(image, session=session, alpha_matting=alpha_matting)
    else:
        print("⚠️ rembg ausente: Processando imagem mantendo recorte original.")
        raw_cutout = image

    # Padronização: Achatamento do canal alpha sobre fundo branco sólido (RGB)
    print("⚪ Aplicando fundo branco sólido e convertendo para RGB...")
    background = Image.new("RGBA", raw_cutout.size, (255, 255, 255, 255))
    composed_image = Image.alpha_composite(background, raw_cutout.convert("RGBA")).convert("RGB")

    # Redimensionamento máximo otimizado para PWA
    if max_dimension and (composed_image.width > max_dimension or composed_image.height > max_dimension):
        print(f"📐 Redimensionando ({composed_image.width}x{composed_image.height}) -> max_dim: {max_dimension}px...")
        resample_method = getattr(Image.Resampling, 'LANCZOS', getattr(Image, 'LANCZOS', Image.BICUBIC))
        composed_image.thumbnail((max_dimension, max_dimension), resample=resample_method)

    # Otimização de salvamento em formato WebP com qualidade ajustada (<100-150KB)
    print(f"💾 Salvando imagem otimizada com fundo branco (.webp): {output_file}")
    composed_image.save(output_file, format="WEBP", quality=quality, method=6, optimize=True)

    file_size_kb = output_file.stat().st_size / 1024
    print(f"✅ Concluído! Tamanho final: {file_size_kb:.1f} KB")

    return str(output_file)

def batch_process_directory(input_dir: str, max_dimension: int = 1000, quality: int = 80):
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
            res = process_single_image(str(img_path), max_dimension=max_dimension, quality=quality)
            processed_files.append(res)
        except Exception as e:
            print(f"❌ Erro ao processar {img_path.name}: {e}")

    return processed_files

def main():
    parser = argparse.ArgumentParser(
        description="Pipeline de IA local para remoção de fundo, fundo branco e conversão otimizada para WebP."
    )
    parser.add_argument("input_path", nargs="?", help="Caminho da imagem de entrada ou diretório")
    parser.add_argument("-o", "--output", help="Caminho do arquivo de saída .webp")
    parser.add_argument("--batch", action="store_true", help="Processar diretório completo")
    parser.add_argument("--max-dim", type=int, default=1000, help="Dimensão máxima em pixels (largura/altura, padrão: 1000)")
    parser.add_argument("--quality", type=int, default=80, help="Qualidade de compressão WebP (1-100, padrão: 80)")

    args = parser.parse_args()

    if not args.input_path:
        if RAW_DIR.exists() and any(RAW_DIR.iterdir()):
            print(f"Nenhum caminho informado. Processando pasta padrão: {RAW_DIR}")
            batch_process_directory(str(RAW_DIR), max_dimension=args.max_dim, quality=args.quality)
            sys.exit(0)
        else:
            print("Uso: python process_image.py <caminho_imagem_ou_diretorio> [-o saída.webp] [--max-dim 1000] [--quality 80]")
            sys.exit(1)

    input_path = Path(args.input_path)

    if args.batch or input_path.is_dir():
        batch_process_directory(str(input_path), max_dimension=args.max_dim, quality=args.quality)
    else:
        process_single_image(str(input_path), args.output, max_dimension=args.max_dim, quality=args.quality)

if __name__ == "__main__":
    main()
