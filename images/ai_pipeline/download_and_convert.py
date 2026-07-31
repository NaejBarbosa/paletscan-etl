import os
import sys
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
import io

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STAGING_DIR = os.path.join(BASE_DIR, 'staging')
PROCESSED_DIR = os.path.join(BASE_DIR, 'images', 'processed')
PWA_PUBLIC_DIR = '/root/repo_pwa/public/imagens_produtos'

os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(PWA_PUBLIC_DIR, exist_ok=True)

HTTP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
}

def load_all_products():
    products = []
    for filename in ['brf_staging.json', 'friboi_staging.json']:
        filepath = os.path.join(STAGING_DIR, filename)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                prods = data.get('produtos', [])
                for p in prods:
                    url = p.get('imagem_url')
                    if url and isinstance(url, str) and url.startswith('http') and not 'supabase.co' in url:
                        products.append({
                            'id': p['id'],
                            'descricao': p.get('descricao_padronizada', ''),
                            'url': url
                        })
    return products

def process_single_image(prod):
    prod_id = prod['id']
    url = prod['url']
    processed_path = os.path.join(PROCESSED_DIR, f"{prod_id}.webp")
    pwa_path = os.path.join(PWA_PUBLIC_DIR, f"{prod_id}.webp")

    # Se já existir em ambas as pastas, pular
    if os.path.exists(processed_path) and os.path.exists(pwa_path):
        return {'id': prod_id, 'status': 'SKIPPED', 'path': processed_path}

    try:
        req = urllib.request.Request(url, headers=HTTP_HEADERS)
        with urllib.request.urlopen(req, timeout=12) as resp:
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' in content_type:
                return {'id': prod_id, 'status': 'FAILED_HTML', 'url': url}

            img_data = resp.read()
            img = Image.open(io.BytesIO(img_data))

            # Converte para RGBA se necessário
            if img.mode != 'RGBA':
                img = img.convert('RGBA')

            # Cria fundo branco sólido
            background = Image.new('RGBA', img.size, (255, 255, 255, 255))
            alpha_composite = Image.alpha_composite(background, img)
            final_img = alpha_composite.convert('RGB')

            # Redimensiona mantendo proporção (max 1000px)
            final_img.thumbnail((1000, 1000), Image.Resampling.LANCZOS)

            # Salva como .webp otimizado
            final_img.save(processed_path, 'WEBP', quality=85, optimize=True)
            final_img.save(pwa_path, 'WEBP', quality=85, optimize=True)

            return {'id': prod_id, 'status': 'SUCCESS', 'path': processed_path}
    except Exception as e:
        return {'id': prod_id, 'status': 'FAILED', 'url': url, 'error': str(e)}

def main():
    print("🖼️  === INICIANDO DOWNLOAD E CONVERSÃO DE IMAGENS EM WEBP ===")
    products = load_all_products()
    print(f"📦 Total de produtos com imagem remota para processar: {len(products)}")

    success_count = 0
    skipped_count = 0
    failed_count = 0

    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(process_single_image, p) for p in products]
        for idx, future in enumerate(as_completed(futures), 1):
            res = future.result()
            st = res['status']
            if st == 'SUCCESS':
                success_count += 1
            elif st == 'SKIPPED':
                skipped_count += 1
            else:
                failed_count += 1

            if idx % 50 == 0 or idx == len(products):
                print(f"⏳ Processando imagens: {idx}/{len(products)} (Sucessos: {success_count}, Pulados: {skipped_count}, Falhas: {failed_count})")

    print("\n🎉 === RESUMO DO PROCESSAMENTO DE MÍDIA ===")
    print(f"✅ Convertidas para WebP com Fundo Branco: {success_count}")
    print(f"⏭️  Já existiam no cache local: {skipped_count}")
    print(f"❌ Imagens remotas inacessíveis/404: {failed_count}")
    print(f"📁 Pasta local de destino: {PROCESSED_DIR}")
    print(f"📁 Pasta PWA local: {PWA_PUBLIC_DIR}")

if __name__ == '__main__':
    main()
