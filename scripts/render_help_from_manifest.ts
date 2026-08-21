import fs from "fs";
import path from "path";

const manifestPath = path.resolve(__dirname, "../core/manifest/schema_manifest.json");

interface HoldingManifest {
  id: string;
  nome: string;
  divisoes: string[];
  marcas: string[];
  scrapers: string[];
  aliases_scraper: string[];
}

interface ManifestData {
  manifesto_holdings?: HoldingManifest[];
  manifesto_aliases?: Record<string, string>;
}

export function renderHelpFromManifest() {
  let holdings: HoldingManifest[] = [];
  let aliases: Record<string, string> = {};

  if (fs.existsSync(manifestPath)) {
    try {
      const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ManifestData;
      holdings = content.manifesto_holdings || [];
      aliases = content.manifesto_aliases || {};
    } catch {
      // Fallback
    }
  }

  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m📦 PALETSCAN ETL ── MANIFEST CLI\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("");
  console.log("\x1b[1;33m⚡ PIPELINE COMPLETO (ALL-IN-ONE)\x1b[0m");
  console.log("  \x1b[1;32metl-run\x1b[0m        Executa + Sync + Relatório Timestamps");
  console.log("  \x1b[1;32metl-pipeline\x1b[0m   Atalho idêntico ao etl-run");
  console.log("");
  console.log("\x1b[1;33m🏢 HOLDINGS & MARCAS REGISTRADAS NO MANIFESTO\x1b[0m");

  if (holdings.length > 0) {
    for (const h of holdings) {
      console.log(` 🔹 \x1b[1m${h.nome}\x1b[0m`);
      
      // Agrupa marcas em linhas curtas de max ~34 caracteres para mobile
      let currentLine = "    • ";
      for (let i = 0; i < h.marcas.length; i++) {
        const marca = h.marcas[i];
        if ((currentLine + marca).length > 34) {
          console.log(currentLine);
          currentLine = "    • " + marca + (i < h.marcas.length - 1 ? ", " : "");
        } else {
          currentLine += marca + (i < h.marcas.length - 1 ? ", " : "");
        }
      }
      if (currentLine.trim() !== "•") {
        console.log(currentLine);
      }
    }
  }

  console.log("");
  console.log("\x1b[1;33m🚀 EXTRAÇÃO INDIVIDUAL (SCRAPERS)\x1b[0m");
  console.log("  \x1b[1;32metl-friboi\x1b[0m     JBS Friboi B2B");
  console.log("  \x1b[1;32metl-seara\x1b[0m      Seara Alimentos");
  console.log("  \x1b[1;32metl-brf\x1b[0m        BRF (Sadia/Perdigão)");
  console.log("  \x1b[1;32metl-aurora\x1b[0m     Aurora Alimentos");
  console.log("  \x1b[1;32metl-lar\x1b[0m        Cooperativa Lar");
  console.log("  \x1b[1;32metl-copacol\x1b[0m    Copacol Alimentos");
  console.log("  \x1b[1;32metl-scrape-all\x1b[0m Todos Fornecedores");
  console.log("");
  console.log("\x1b[1;33m🔄 PROCESSAMENTO & PIPELINE\x1b[0m");
  console.log("  \x1b[1;32metl-sync\x1b[0m       Carga Supabase UUIDv5");
  console.log("  \x1b[1;32metl-images\x1b[0m     IA Fundo Branco");
  console.log("  \x1b[1;32metl-sanitize\x1b[0m   Limpeza Title Case/EAN");
  console.log("  \x1b[1;32metl-export\x1b[0m     Gera produtos.json PWA");
  console.log("  \x1b[1;32metl-export-excel\x1b[0m Relatório Excel");
  console.log("  \x1b[1;32metl-audit\x1b[0m      Auditoria de Banco");
  console.log("  \x1b[1;32metl-wipe\x1b[0m       Limpar Supabase");
  console.log("");
  console.log("\x1b[1;33m📊 LOGS & SAÚDE DO SISTEMA\x1b[0m");
  console.log("  \x1b[1;32metl-logs\x1b[0m       Ver logs em tempo real");
  console.log("  \x1b[1;32metl-novos\x1b[0m      Ver novos produtos da base");
  console.log("  \x1b[1;32metl-conflicts\x1b[0m  Conflitos de EAN/DUN");
  console.log("  \x1b[1;32metl-status\x1b[0m     Status Supabase ao vivo");
  console.log("");
  console.log("\x1b[1;33m⏰ AGENDAMENTO (CRONTAB)\x1b[0m");
  console.log("  \x1b[1;32metl-schedule\x1b[0m   Agendar no Linux");
  console.log("  \x1b[1;32metl-cron-list\x1b[0m  Ver agendamentos");
  console.log("  \x1b[1;32metl-cron-remove\x1b[0m Rem. agendamento");
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
}

if (require.main === module) {
  renderHelpFromManifest();
}
