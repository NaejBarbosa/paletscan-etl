#!/usr/bin/env python3
"""
Mining script for Central MBRF B2B Commerce Catalog
Fetches product search results and detailed records from Salesforce Commerce REST API.
Saves cache to staging/mbrf_b2b_cache.json
"""
import urllib.request
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

WEBSTORE_ID = '0ZEKj000000ox4zOAA'
CATEGORY_ID = '0ZGKj000000ttlHOAQ'
STAGING_DIR = '/root/paletscan-etl/staging'
CACHE_FILE = os.path.join(STAGING_DIR, 'mbrf_b2b_cache.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
}

def fetch_search_products():
    print("📡 Coletando lista de produtos via busca da Central MBRF...")
    all_products = []
    page = 0
    while True:
        url = f'https://centralmbrf.com.br/services/data/v60.0/commerce/webstores/{WEBSTORE_ID}/search/products?categoryId={CATEGORY_ID}&pageSize=100&page={page}'
        req = urllib.request.Request(url, headers=HEADERS)
        success = False
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    page_info = data.get('productsPage', {})
                    prods = page_info.get('products', [])
                    total = page_info.get('total', 0)
                    all_products.extend(prods)
                    print(f"  Página {page}: {len(prods)} produtos obtidos (Acumulado: {len(all_products)}/{total})")
                    if len(all_products) >= total or len(prods) == 0:
                        success = True
                        break
                    success = True
                    page += 1
                    break
            except Exception as e:
                print(f"  [!] Tentativa {attempt + 1} falhou na página {page}: {e}")
                time.sleep(2)
        if not success or (len(all_products) >= total and total > 0):
            break
    print(f"✅ Total de {len(all_products)} produtos identificados na Central MBRF.")
    return all_products

def fetch_product_detail(prod_id):
    url = f'https://centralmbrf.com.br/services/data/v60.0/commerce/webstores/{WEBSTORE_ID}/products/{prod_id}'
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return prod_id, data
        except Exception:
            time.sleep(1)
    return prod_id, None

def main():
    os.makedirs(STAGING_DIR, exist_ok=True)
    existing_cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                existing_cache = json.load(f)
            print(f"📦 Cache existente carregado com {len(existing_cache)} produtos detalhados.")
        except Exception as e:
            print(f"Aviso ao ler cache: {e}")

    search_prods = fetch_search_products()
    needed_ids = [p['id'] for p in search_prods if p.get('id') and p['id'] not in existing_cache]
    print(f"🔍 Produtos a detalhar: {len(needed_ids)} de {len(search_prods)} (restantes já em cache)")

    if needed_ids:
        concurrency = 8
        print(f"⚡ Disparando mineração assíncrona ({concurrency} workers)...")
        completed_count = 0
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_to_id = {executor.submit(fetch_product_detail, pid): pid for pid in needed_ids}
            for future in as_completed(future_to_id):
                pid = future_to_id[future]
                try:
                    res_id, data = future.result()
                    if data:
                        existing_cache[res_id] = data
                except Exception as e:
                    print(f"Erro ao processar {pid}: {e}")
                completed_count += 1
                if completed_count % 50 == 0 or completed_count == len(needed_ids):
                    print(f"  ⏳ Progresso mineração B2B: [{completed_count}/{len(needed_ids)}] detalhados.")
                    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(existing_cache, f, ensure_ascii=False)

    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(existing_cache, f, ensure_ascii=False)
    print(f"🎉 Mineração Central MBRF finalizada! Cache salvo em {CACHE_FILE} com {len(existing_cache)} registros.")

if __name__ == '__main__':
    main()
