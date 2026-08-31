# 📱 Dev Móvel no Smartphone & Termux

Um dos pilares mais singulares do **Ecossistema PaletScan** é a sua origem e ciclo de vida inteiramente móveis: tanto o pipeline de engenharia de dados (ETL) quanto a aplicação cliente (PWA) foram idealizados, desenvolvidos, testados e documentados diretamente a partir de um smartphone Android.

---

## 🛠️ 1. Infraestrutura Linux no Smartphone (Termux + PRoot Ubuntu)

Sem a utilização de computadores tradicionais, o ambiente de desenvolvimento completo foi estruturado no celular via **Termux** rodando uma distribuição Linux containerizada (**PRoot Ubuntu ARM64**), encadeada em uma esteira 100% vertical:

```mermaid
flowchart TD
    HW["📱 Smartphone Android (Processador ARM64)"]
    HW --> TM["💻 Emulador de Terminal Termux"]
    TM --> UB["🐧 Linux Containerizado PRoot Ubuntu"]

    UB --> L1["📦 1. Camada de Engenharia de Dados"]
    L1 --> D1["Node.js 20 & TypeScript Core (Pipelines ETL)"]
    D1 --> K1["☁️ Carga Direta no Supabase PostgreSQL"]

    K1 --> L2["🐍 2. Camada de Visão Computacional"]
    L2 --> D2["Python 3.11 & rembg U2Net (IA de Imagens)"]
    D2 --> K2["🖼️ Geração e Upload de WebP Otimizado"]

    K2 --> L3["⚡ 3. Camada de Aplicação Frontend"]
    L3 --> D3["Servidor Next.js 14 & Serwist (PWA)"]
    D3 --> K3["📱 Execução Localhost no Navegador e Coletor"]

    K3 --> L4["📚 4. Camada de Documentação & CI/CD"]
    L4 --> D4["Git, OpenSSH & MkDocs Material"]
    D4 --> K4["🌐 Deploy Automático no GitHub Pages"]

    K4 --> L5["🤖 5. Agente Inteligente"]
    L5 --> D5["Agente Antigravity AI (Google DeepMind)"]
    D5 --> K5["🛠️ Auditoria, Refatoração e Diagnóstico ao Vivo"]
```

### Componentes do Ambiente Móvel:
* **Node.js 20 & npm**: Compilação de scrapers, execução de validações Modulus 10 e compilação do Service Worker Serwist.
* **Python 3 & rembg (U2Net/ONNX)**: Execução local de modelos de aprendizado profundo (*Deep Learning*) para remoção de fundo e tratamento de imagens em CPU ARM64 móvel.
* **MkDocs Material**: Compilação e publicação automatizada do site de documentação unificado via GitHub Actions.
* **Agente Antigravity (Google DeepMind)**: Assistente IA que opera como copiloto avançado diretamente no terminal móvel, realizando diagnóstico em tempo real, refatorações complexas e auditoria de código.

---

## ⏰ 2. Persistência de Rotinas Noturnas no Android (Crontab & Wake-Lock)

Para permitir que o pipeline ETL (`etl-run`) seja executado automaticamente de madrugada (ex: 03:00) com a tela do celular apagada:

1. **Ativação do Wake-Lock**:
   ```bash
   termux-wake-lock
   ```
   *Impede que a CPU do smartphone entre em modo de suspensão profunda (Deep Sleep).*
2. **Bateria Irrestrita**:
   *Configurar a gestão de bateria do aplicativo Termux no Android como **Sem Restrições**.*
3. **Monitoramento e Autocura**:
   *Utilizar `etl-cron-status` para verificar a integridade do daemon e acompanhar os logs.*

---

## 📲 3. Indexação Nativa de Arquivos no Android (Media Scan)

Ao exportar relatórios para a memória interna do celular (`/sdcard/Download/`), o sistema invoca utilitários nativos do Termux para indexar imediatamente tanto planilhas **CSV** quanto documentos **PDF**:

```bash
# Indexação nativa de relatórios CSV e PDF no Android
termux-media-scan /sdcard/Download/relatorio_paletes.csv
termux-media-scan /sdcard/Download/relatorio_paletes.pdf
```

### Por que o MediaScan é Crucial no Chão de Fábrica?
* **Atualização Imediata do MediaStore**: Elimina a necessidade de reiniciar o smartphone ou conectar via USB para localizar arquivos baixados.
* **Agilidade no Compartilhamento**: O operador de empilhadeira gera o relatório PDF ou CSV e pode anexá-lo instantaneamente no WhatsApp corporativo ou e-mail.

---

## 🚀 4. Guia de Execução Local Unificado

```bash
# 1. Clonar o repositório ETL
git clone https://github.com/NaejBarbosa/paletscan-etl.git
cd paletscan-etl

# 2. Instalar dependências Node.js e Python
npm install
pip install -r requirements.txt

# 3. Executar o pipeline de extração e tratamento
npm run full

# 4. Compilar e testar a documentação unificada
mkdocs serve
```
