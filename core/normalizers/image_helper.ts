import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export const PWA_PUBLIC_IMG_DIR = '/root/repo_pwa/public/imagens_produtos';
export const LOCAL_PROCESSED_IMG_DIR = path.resolve(process.cwd(), 'images', 'processed');

export const MANUAL_SEM_IMAGEM_EANS = new Set([
  '7896419732518',
  '7896419732556',
  '7896419732525',
  '7896419732501'
]);

/**
 * Baixa uma imagem oficial de produto via HTTP, converte em WebP com fundo branco limpo
 * e salva simultaneamente na pasta de mídia do ETL e na pasta pública do PWA.
 */
export async function downloadAndConvertOfficialWebp(imgUrl: string, targetBarcode: string): Promise<boolean> {
  if (!imgUrl || !targetBarcode) return false;
  if (MANUAL_SEM_IMAGEM_EANS.has(targetBarcode)) return false;

  try {
    if (!fs.existsSync(LOCAL_PROCESSED_IMG_DIR)) fs.mkdirSync(LOCAL_PROCESSED_IMG_DIR, { recursive: true });
    if (!fs.existsSync(PWA_PUBLIC_IMG_DIR)) fs.mkdirSync(PWA_PUBLIC_IMG_DIR, { recursive: true });

    const tempFile = path.join('/tmp', `etl_img_${targetBarcode}_${Date.now()}.tmp`);
    const targetWebp1 = path.join(LOCAL_PROCESSED_IMG_DIR, `${targetBarcode}.webp`);
    const targetWebp2 = path.join(PWA_PUBLIC_IMG_DIR, `${targetBarcode}.webp`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(imgUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) return false;

    fs.writeFileSync(tempFile, buffer);

    const pyScript = `
import sys
from PIL import Image
try:
    src_file = sys.argv[1]
    out_file1 = sys.argv[2]
    out_file2 = sys.argv[3]
    img = Image.open(src_file).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    alpha_composite = Image.alpha_composite(bg, img)
    final_img = alpha_composite.convert("RGB")
    final_img.save(out_file1, "WEBP", quality=92, method=6)
    final_img.save(out_file2, "WEBP", quality=92, method=6)
    print("OK")
except Exception as e:
    print(f"ERROR: {e}")
`;
    const out = execFileSync('python3', ['-c', pyScript, tempFile, targetWebp1, targetWebp2], { encoding: 'utf-8' }).trim();
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

    return out.includes('OK') && fs.existsSync(targetWebp2);
  } catch {
    return false;
  }
}
