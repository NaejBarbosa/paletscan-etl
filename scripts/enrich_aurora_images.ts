import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const publicImgDir = '/root/repo_pwa/public/imagens_produtos';
const auroraPreparedDir = '/root/projetos-scraping/scraping-aurora/imagens_preparadas';
const auroraStagingUuidFile = '/root/paletscan-etl/staging/aurora_staging_uuid.json';
const pwaJsonPath = '/root/repo_pwa/public/produtos.json';

interface EnrichedResult {
  ean: string;
  sku: string;
  dun?: string;
  title: string;
  image_url: string;
  source: string;
}

async function fetchCosmosProduct(gtin: string): Promise<{ imageUrl?: string; title?: string } | null> {
  const url = `https://cosmos.bluesoft.com.br/produtos/${gtin}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    // Tenta encontrar og:image ou img#product_gallery_image ou img_principal
    const ogMatch = html.match(/meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                    html.match(/meta\s+name="og:image"\s+content="([^"]+)"/i) ||
                    html.match(/<img[^>]+id="product_gallery_image"[^>]+src="([^"]+)"/i) ||
                    html.match(/<img[^>]+class="product-image"[^>]+src="([^"]+)"/i);

    const titleMatch = html.match(/<h1[^>]*class="product-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/meta\s+property="og:title"\s+content="([^"]+)"/i);

    if (ogMatch && ogMatch[1]) {
      const imgUrl = ogMatch[1].trim();
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      if (imgUrl && !imgUrl.includes('no-image') && !imgUrl.includes('missing')) {
        return { imageUrl: imgUrl, title };
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

async function downloadAndProcessWebp(imgUrl: string, targetEan: string): Promise<boolean> {
  try {
    if (!fs.existsSync(auroraPreparedDir)) fs.mkdirSync(auroraPreparedDir, { recursive: true });
    if (!fs.existsSync(publicImgDir)) fs.mkdirSync(publicImgDir, { recursive: true });

    const tempFile = path.join('/tmp', `temp_${targetEan}_${Date.now()}.img`);
    const targetWebpFile1 = path.join(auroraPreparedDir, `${targetEan}.webp`);
    const targetWebpFile2 = path.join(publicImgDir, `${targetEan}.webp`);

    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) return false; // Ignora imagens inválidas/placeholders pequenos

    fs.writeFileSync(tempFile, buffer);

    // Converte e trata fundo com Python PIL (qualidade máxima, fundo branco sólido #FFFFFF e WebP de alta fidelidade)
    const pyScript = `
import sys
from PIL import Image

try:
    img = Image.open("${tempFile}").convert("RGBA")
    # Cria canvas fundo branco sólido
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    alpha_composite = Image.alpha_composite(bg, img)
    final_img = alpha_composite.convert("RGB")
    final_img.save("${targetWebpFile1}", "WEBP", quality=92, method=6)
    final_img.save("${targetWebpFile2}", "WEBP", quality=92, method=6)
    print("OK")
except Exception as e:
    print(f"ERROR: {e}")
`;

    const pyCmd = `python3 -c '${pyScript.replace(/'/g, "'\\''")}'`;
    const out = execSync(pyCmd, { encoding: 'utf-8' }).trim();
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

    return out.includes('OK') && fs.existsSync(targetWebpFile2);
  } catch (err) {
    return false;
  }
}

async function enrichAuroraCatalog() {
  console.log('🚀 === ENRIQUECIMENTO E CONSOLIDAÇÃO DO CATÁLOGO AURORA (EAN/SKU/DUN) ===\n');

  if (!fs.existsSync(auroraStagingUuidFile)) {
    console.error('Arquivo aurora_staging_uuid.json não encontrado!');
    return;
  }

  const auroraStaging = JSON.parse(fs.readFileSync(auroraStagingUuidFile, 'utf-8'));
  const produtos = auroraStaging.produtos || [];
  const codigos = auroraStaging.codigos_barras || [];

  // Mapear EANs por produto_id
  const prodEanMap = new Map<string, string>();
  const prodDunMap = new Map<string, string>();

  codigos.forEach((c: any) => {
    const clean = String(c.codigo || '').trim();
    if (clean && /^\d+$/.test(clean)) {
      if (c.tipo === 'EAN-13' || c.tipo === 'EAN_13' || c.tipo === 'EAN') {
        prodEanMap.set(c.produto_id, clean);
      } else if (c.tipo === 'DUN-14' || c.tipo === 'DUN_14' || c.tipo === 'DUN') {
        prodDunMap.set(c.produto_id, clean);
      }
    }
  });

  let totalProds = produtos.length;
  let hasImageCount = 0;
  let enrichedCount = 0;
  let missingImageProds: any[] = [];

  for (const p of produtos) {
    const ean = prodEanMap.get(p.id) || (p.ean ? String(p.ean).trim() : '');
    const dun = prodDunMap.get(p.id) || (p.dun ? String(p.dun).trim() : '');
    const sku = p.sku || p.id;

    // Regra do Usuário: Na consolidação precisamos de pelo menos o EAN do produto
    if (!ean) {
      console.warn(`[!] Produto sem EAN (SKU: ${sku}): ${p.descricao_padronizada}. Pulando...`);
      continue;
    }

    const fileWebpPublic = path.join(publicImgDir, `${ean}.webp`);
    const fileWebpPrepared = path.join(auroraPreparedDir, `${ean}.webp`);

    let isImagePresent = fs.existsSync(fileWebpPublic) || fs.existsSync(fileWebpPrepared);

    if (isImagePresent) {
      hasImageCount++;
      // Garante que o arquivo esteja em ambas as pastas
      if (!fs.existsSync(fileWebpPublic) && fs.existsSync(fileWebpPrepared)) {
        fs.copyFileSync(fileWebpPrepared, fileWebpPublic);
      } else if (!fs.existsSync(fileWebpPrepared) && fs.existsSync(fileWebpPublic)) {
        fs.copyFileSync(fileWebpPublic, fileWebpPrepared);
      }
    } else {
      missingImageProds.push({ prod: p, ean, sku, dun });
    }
  }

  console.log(`📊 Catálogo Aurora: ${totalProds} produtos.`);
  console.log(`🖼️  Possuem imagem de alta qualidade verificada: ${hasImageCount} (${((hasImageCount/totalProds)*100).toFixed(1)}%)`);
  console.log(`🔎 Candidatos a busca e enriquecimento via GTIN/EAN: ${missingImageProds.length}\n`);

  // Executa busca de enriquecimento para os produtos sem imagem
  for (let i = 0; i < missingImageProds.length; i++) {
    const { prod, ean, sku } = missingImageProds[i];
    console.log(`[${i + 1}/${missingImageProds.length}] Pesquisando fontes para EAN ${ean} (SKU: ${sku}): ${prod.descricao_padronizada}...`);

    const cosmosRes = await fetchCosmosProduct(ean);
    if (cosmosRes && cosmosRes.imageUrl) {
      console.log(`   [+] Encontrada imagem no Bluesoft Cosmos: ${cosmosRes.imageUrl}`);
      const downloaded = await downloadAndProcessWebp(cosmosRes.imageUrl, ean);
      if (downloaded) {
        console.log(`   ✅ Imagem baixada, tratada em WebP e salva para EAN ${ean}!`);
        enrichedCount++;
        hasImageCount++;

        // Atualizar produto no array staging
        prod.imagem_url = `/imagens_produtos/${ean}.webp`;
        prod.status_imagem = 'VALIDATED';
      } else {
        console.warn(`   [!] Falha no download/processamento da imagem do EAN ${ean}`);
      }
    } else {
      console.log(`   [-] Imagem não encontrada no Cosmos para EAN ${ean}`);
    }

    // Pequena pausa respeitosa entre requisições
    await new Promise(r => setTimeout(r, 400));
  }

  // 4. Salva o staging atualizado
  fs.writeFileSync(auroraStagingUuidFile, JSON.stringify(auroraStaging, null, 2), 'utf-8');

  // 5. Atualizar Supabase PostgreSQL e produtos.json do PWA
  console.log('\n🔄 Atualizando banco Supabase e catálogo PWA...');
  try {
    execSync('npx tsx scripts/update_supabase_local_image_urls.ts', { stdio: 'inherit' });
    execSync('npx tsx scripts/generate_pwa_produtos_json.ts', { stdio: 'inherit' });
  } catch (err: any) {
    console.warn(`[!] Aviso ao sincronizar banco: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log('🎉 ENRIQUECIMENTO DO CATÁLOGO AURORA CONCLUÍDO!');
  console.log(`📊 Novas imagens enriquecidas e salvas: ${enrichedCount}`);
  console.log(`📊 Total final de produtos Aurora com imagem WebP: ${hasImageCount} / ${totalProds} (${((hasImageCount/totalProds)*100).toFixed(1)}%)`);
  console.log('==================================================\n');
}

enrichAuroraCatalog();
