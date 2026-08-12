import { execSync } from 'child_process';
import * as path from 'path';

export interface PDFExtractionResult {
  success: boolean;
  sku?: string;
  barcode?: string;
  image_path?: string;
  pdf_used?: string;
  error?: string;
}

const PDF_EXTRACTOR_SCRIPT = path.resolve(__dirname, '../../images/ai_pipeline/pdf_extractor.py');

/**
 * Invoca o extrator em Python de imagens do catálogo PDF da Aurora para um determinado SKU.
 * Trata o fundo com transparência alfa em fundo sólido branco (#ffffff) e redimensiona para WebP 400px.
 * 
 * @param sku SKU do produto (ex: '424')
 * @param barcode Código de barras EAN/DUN para renomear o arquivo final WebP
 * @param pdfPath Caminho opcional do catálogo PDF aurora_catalogo.pdf
 * @param outputDir Diretório opcional para salvar a imagem WebP
 */
export function extractAndAdaptAuroraPdfImage(
  sku: string,
  barcode: string,
  pdfPath?: string,
  outputDir?: string
): PDFExtractionResult {
  let cmd = `python3 "${PDF_EXTRACTOR_SCRIPT}" "${sku.replace(/"/g, '\\"')}" --barcode "${barcode.replace(/"/g, '\\"')}"`;
  if (pdfPath) {
    cmd += ` --pdf "${pdfPath.replace(/"/g, '\\"')}"`;
  }
  if (outputDir) {
    cmd += ` --outdir "${outputDir.replace(/"/g, '\\"')}"`;
  }

  try {
    const rawOutput = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    const result: PDFExtractionResult = JSON.parse(rawOutput.trim());
    return result;
  } catch (err: any) {
    return {
      success: false,
      sku,
      barcode,
      error: `Erro ao executar extrator PDF Python: ${err.message}`
    };
  }
}
