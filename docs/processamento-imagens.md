# 🖼️ Pipeline de IA e Processamento de Imagens

O módulo de visão computacional do PaletScan ETL ([`images/ai_pipeline/process_image.py`](file:///root/paletscan-etl/images/ai_pipeline/process_image.py)) é responsável pela remoção de fundo por inteligência artificial, padronização em fundo branco sólido e otimização para formato WebP ultra-leve.

---

## 🤖 1. Pipeline de Inteligência Artificial Local (`process_image.py`)

Em vez de dependências de APIs de terceiros pagas, o PaletScan utiliza um pipeline de IA **100% local e privado** construído em Python com `rembg` (baseado em modelos de redes neurais U2Net/ONNX) e `Pillow`.

```mermaid
graph LR
    A[Imagem Bruta / Raw] -->|process_image.py| B[Rede Neural rembg U2Net]
    B -->|Máscara Transparente| C[Canal Alpha RGBA]
    C -->|Achatamento Alpha| D[Fundo Branco Sólido #FFFFFF]
    D -->|Resize max-dim 1000| E[Pillow Resampling]
    E -->|Compressão WebP| F[Arquivo Otimizado .webp <150KB]
```

---

## ⚙️ 2. Etapas do Processamento Visual

### A. Remoção de Fundo via IA (`rembg`)
A imagem bruta baixada pelo scraper em `images/raw/` é submetida ao modelo neural da biblioteca `rembg`. O modelo isola a peça de carne ou embalagem comercial do cenário original (estantes, sombras de estúdio ou marcas d'água), gerando uma imagem intermediária com transparência no canal Alpha (`RGBA`).

### B. Achatamento sobre Fundo Branco Sólido (`#FFFFFF`)
Para garantir padrão visual homogêneo e legibilidade máxima no aplicativo PWA (especialmente em telas de coletores de dados e smartphones sob pouca iluminação em câmaras frias), o script cria uma imagem base sólida em RGB na cor branca pura (`255, 255, 255`) e sobrepõe a imagem tratada utilizando a máscara de transparência do canal Alpha:

```python
# Trecho simplificado da lógica implementada em process_image.py
background = Image.new("RGB", img_rgba.size, (255, 255, 255))
background.paste(img_rgba, mask=img_rgba.split()[3])  # Aplica o Alpha channel
```

### C. Redimensionamento e Otimização WebP
- **Dimensão Máxima (`--max-dim 1000`)**: Mantém a proporção original da foto limitando a maior dimensão a 1000 pixels, o que garante excelente definição de rótulos e selos sem desperdício de resolução.
- **Conversão Otimizada para `.webp`**: Salva a imagem final no formato WebP de alta eficiência, reduzindo o peso médio dos arquivos de 2MB-5MB (brutos) para **menos de 100-150KB**.

---

## 📁 3. Ciclo de Vida das Imagens nos Diretórios

O gerenciamento de arquivos de mídia segue um fluxo limpo e rastreável dentro de `images/`:

```text
images/
├── raw/         # Recebe as fotos brutas baixadas pelos scrapers
├── processed/   # Armazena as imagens tratadas prontas para upload
├── archived/    # Imagens que já foram enviadas com sucesso para o Supabase Storage
└── ai_pipeline/ # Código fonte Python (process_image.py)
```

---

## 🖥️ 4. Como Executar o Script

O script pode ser executado manualmente via linha de comando ou ser invocado pelo pipeline TypeScript:

```bash
# Execução básica apontando para o diretório de imagens brutas
python3 images/ai_pipeline/process_image.py --input images/raw --output images/processed

# Execução com parâmetros de dimensão máxima e qualidade WebP
python3 images/ai_pipeline/process_image.py \
  --input images/raw \
  --output images/processed \
  --max-dim 1000 \
  --quality 85
```
