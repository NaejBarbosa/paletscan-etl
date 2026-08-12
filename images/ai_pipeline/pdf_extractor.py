#!/usr/bin/env python3
"""
Módulo de Extração e Adaptação de Imagens do Catálogo PDF da Aurora
PaletScan ETL - Fallback de Extração Geométrica + Tratamento de Fundo

Realiza:
1. Localização do PDF do catálogo Aurora (aurora_catalogo.pdf).
2. Busca geométrica da imagem correspondente ao SKU no PDF via PyMuPDF (fitz).
3. Tratamento de fundo (flatten em branco #ffffff) e redimensionamento proporcional (max 400px).
4. Conversão para formato WebP otimizado (quality=80).
"""

import os
import sys
import io
import json
import argparse
from typing import Optional, List

try:
    import fitz  # PyMuPDF
    from PIL import Image
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Biblioteca ausente: {e}"}))
    sys.exit(1)

CANDIDATE_PDF_PATHS = [
    "/root/.gemini/antigravity-cli/brain/3dcfc4c3-1fc6-43f0-b136-3b1001d38b00/scratch/aurora_catalogo.pdf",
    "/root/projetos-scraping/scraping-aurora/aurora_catalogo.pdf",
    "/root/paletscan-etl/staging/aurora_catalogo.pdf",
    "/root/paletscan-etl/data/aurora_catalogo.pdf"
]

CANDIDATE_OUTPUT_DIRS = [
    "/root/projetos-scraping/scraping-aurora/imagens_preparadas",
    "/root/paletscan-etl/staging/imagens_preparadas"
]

def find_pdf_file(override_path: Optional[str] = None) -> Optional[str]:
    if override_path and os.path.exists(override_path):
        return override_path
    for path in CANDIDATE_PDF_PATHS:
        if os.path.exists(path):
            return path
    return None

def extract_and_adapt_sku_image(
    sku: str,
    barcode: str,
    pdf_path: Optional[str] = None,
    output_dir: Optional[str] = None
) -> dict:
    target_pdf = find_pdf_file(pdf_path)
    if not target_pdf:
        return {
            "success": False,
            "error": "Arquivo aurora_catalogo.pdf não foi localizado nos caminhos conhecidos."
        }

    target_out_dir = output_dir or CANDIDATE_OUTPUT_DIRS[0]
    os.makedirs(target_out_dir, exist_ok=True)

    sku_clean = str(sku).strip()
    barcode_clean = str(barcode).strip()
    target_filename = f"{barcode_clean}.webp"
    output_file_path = os.path.join(target_out_dir, target_filename)

    # Tenta utilizar o índice pré-computado de SKUs para busca instantânea O(1)
    index_file = "/root/paletscan-etl/staging/aurora_pdf_sku_index.json"
    target_pages = None
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                sku_index = json.load(f)
            if sku_clean not in sku_index:
                return {
                    "success": False,
                    "sku": sku_clean,
                    "error": f"SKU '{sku_clean}' não consta no índice do catálogo PDF Aurora."
                }
            target_pages = sku_index[sku_clean]
        except Exception:
            target_pages = None

    try:
        doc = fitz.open(target_pdf)
    except Exception as e:
        return {"success": False, "error": f"Erro ao abrir arquivo PDF: {e}"}

    found = False
    extracted_path = None

    try:
        pages_to_check = target_pages if target_pages is not None else range(len(doc))
        for p_idx in pages_to_check:
            page = doc[p_idx]
            page_text = page.get_text("text")
            if sku_clean not in page_text:
                continue

            words = page.get_text("words")
            # Busca palavras que batem exatamente com o SKU
            skus_in_page = [w for w in words if w[4].strip() == sku_clean]
            if not skus_in_page:
                continue

            images = page.get_images(full=True)
            if not images:
                continue

            for s in skus_in_page:
                x0, y0, x1, y1, txt = s[0], s[1], s[2], s[3], s[4]
                for img_info in images:
                    xref = img_info[0]
                    rects = page.get_image_rects(xref)
                    if not rects:
                        continue

                    img_rect = rects[0]
                    # Filtra background completo ou elementos decorativos gigantes
                    width = img_info[2]
                    height = img_info[3]
                    if width >= 1900 or height >= 1050 or (img_rect.x0 == 0 and img_rect.y0 == 0):
                        continue

                    # Tolerância de alinhamento geométrico (SKU logo abaixo ou próximo da imagem)
                    is_below = (y0 > img_rect.y1) and (y0 < img_rect.y1 + 55)
                    is_aligned = (x0 > img_rect.x0 - 30) and (x1 < img_rect.x1 + 30)

                    if is_below and is_aligned:
                        pix = fitz.Pixmap(doc, xref)
                        smask = img_info[1]
                        if smask > 0:
                            try:
                                pix_mask = fitz.Pixmap(doc, smask)
                                pix = fitz.Pixmap(pix, pix_mask)
                            except Exception:
                                pass

                        img_bytes = pix.tobytes("png")
                        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

                        # Tratamento de Fundo: cria fundo sólido branco (#ffffff) e aplica composição alfa
                        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
                        composite = Image.alpha_composite(bg, img).convert("RGB")

                        # Redimensionamento padronizado (máximo 400px de largura/altura mantendo proporção)
                        composite.thumbnail((400, 400), Image.Resampling.LANCZOS)

                        # Salva em WebP de alta eficiência (quality 80)
                        composite.save(output_file_path, "WEBP", quality=80)
                        extracted_path = output_file_path
                        found = True
                        break
                if found:
                    break
            if found:
                break
    finally:
        doc.close()

    if found and extracted_path:
        return {
            "success": True,
            "sku": sku_clean,
            "barcode": barcode_clean,
            "image_path": extracted_path,
            "pdf_used": target_pdf
        }
    else:
        return {
            "success": False,
            "sku": sku_clean,
            "error": f"Nenhuma imagem geométrica correspondente ao SKU '{sku_clean}' foi encontrada no PDF."
        }

def main():
    parser = argparse.ArgumentParser(description="Extração geométrica de imagem do PDF Aurora + Tratamento de fundo")
    parser.add_argument("sku", help="SKU do produto Aurora")
    parser.add_argument("--barcode", help="Código de barras EAN/DUN para salvar a imagem", default=None)
    parser.add_argument("--pdf", help="Caminho opcional do arquivo aurora_catalogo.pdf", default=None)
    parser.add_argument("--outdir", help="Diretório de saída para salvar a imagem WebP", default=None)

    args = parser.parse_args()
    barcode = args.barcode or args.sku

    res = extract_and_adapt_sku_image(args.sku, barcode, args.pdf, args.outdir)
    print(json.dumps(res, ensure_ascii=False))

if __name__ == "__main__":
    main()
