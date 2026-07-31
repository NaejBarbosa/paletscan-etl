import os
import sys
import json
from PIL import Image
import io
from rembg import remove
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(BASE_DIR, 'images', 'processed')
PWA_PUBLIC_DIR = '/root/repo_pwa/public/imagens_produtos'

os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(PWA_PUBLIC_DIR, exist_ok=True)

def process_file_with_rembg(filename):
    file_path = os.path.join(PROCESSED_DIR, filename)
    pwa_file_path = os.path.join(PWA_PUBLIC_DIR, filename)

    try:
        with open(file_path, 'rb') as f:
            data = f.read()

        # Executa a remocao de fundo IA via rembg
        output_data = remove(data)
        img = Image.open(io.BytesIO(output_data)).convert('RGBA')

        # Redimensiona para maximo 1000px mantendo transparencia Alpha
        img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)

        img.save(file_path, 'WEBP')
        img.save(pwa_file_path, 'WEBP')
        return True
    except Exception as e:
        print(f"Erro ao processar {filename}: {e}")
        return False

def main():
    print("🤖 === VARREDURA TOTAL E REMOÇÃO DE FUNDO IA (REMBG) PARA 100% DAS IMAGENS ===")
    files = [f for f in os.listdir(PROCESSED_DIR) if f.endswith('.webp')]
    print(f"📦 Total de arquivos de imagens .webp locais para aplicar fundo transparente: {len(files)}")

    processed_count = 0
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(process_file_with_rembg, f) for f in files]
        for idx, future in enumerate(as_completed(futures), 1):
            if future.result():
                processed_count += 1
            if idx % 50 == 0 or idx == len(files):
                print(f"⏳ Progresso IA rembg: {idx}/{len(files)} concluidos ({processed_count} sucessos)...")

    print(f"\n🎉 === VARREDURA E TRANSPARÊNCIA CONCLUÍDA ===")
    print(f"✅ Total de imagens tratadas com fundo 100% transparente (Canal Alpha): {processed_count}")

if __name__ == '__main__':
    main()
