# 📖 Glossário de Termos Técnicos

Este glossário reúne as definições e o contexto prático de todos os termos técnicos, jargões de arquitetura de dados e expressões de engenharia de software utilizados na documentação e no ecossistema do **PaletScan ETL**.

---

## 🔤 A - C

### **Alpha Channel (Canal Alpha / Transparência)**
Componente de uma imagem digital que define o grau de opacidade ou transparência de cada pixel (formato `RGBA`). No pipeline de visão computacional do PaletScan, o canal Alpha gerado pela Inteligência Artificial é utilizado para isolar o produto do fundo original e compor a imagem sobre um fundo branco sólido (`#FFFFFF`).

### **Buffer (Buffer de Memória / Data Buffer)**
Espaço temporário na memória RAM utilizado para armazenar dados binários ou sequências de bytes durante o processamento de entrada e saída (E/S). No ETL, o buffer é utilizado ao ler arquivos de imagens brutas em disco antes de enviá-los via requisições HTTP para a CDN do Supabase ou calcular seus hashes MD5.

### **Bucket (Storage Bucket)**
Contêiner isolado em um serviço de armazenamento de objetos na nuvem (como o Supabase Storage ou AWS S3) projetado para guardar arquivos não estruturados (como imagens `.webp`, documentos ou mídias). No PaletScan, o bucket `produtos-imagens` armazena os ativos visuais otimizados dos produtos.

### **CDN (Content Delivery Network / Rede de Distribuição de Conteúdo)**
Rede geograficamente distribuída de servidores proxy de alta velocidade que armazena cópias em cache de mídias e arquivos estáticos. Garante que os coletores de dados e o aplicativo PWA baixem fotos de produtos com latência mínima.

### **CacheStorage & LocalStorage**
Mecanismos de armazenamento de dados diretamente no navegador web do usuário:
- **CacheStorage**: Armazena requisições HTTP e arquivos estáticos gerenciados pelo *Service Worker*.
- **LocalStorage**: Armazena pares de chave-valor de dados simples (como tokens de autenticação e filas de pendência offline).

---

## 🔤 D - I

### **DUN-14 (Data Universal Numbering / EAN-14)**
Código de barras de 14 dígitos utilizado pela GS1 para a identificação de caixas de embarque, fardos e embalagens coletivas de distribuição logística nas câmaras frias.

### **EAN-13 / EAN-8 (European Article Numbering)**
Padrão internacional de código de barras numérico de 13 ou 8 dígitos utilizado para identificar itens comerciais vendidos na unidade consumidora (embalagem primária do produto).

### **ETL (Extract, Transform, Load / Extração, Transformação e Carga)**
Arquitetura de integração de dados dividida em três fases:
1. **Extract (Extração)**: Coleta de dados brutos das origens (scrapers B2B).
2. **Transform (Transformação)**: Sanitização, cálculo Modulus 10, geração de UUIDv5 e tratamento visual via IA.
3. **Load (Carga)**: Inserção relacional no banco de dados (Supabase PostgreSQL).

### **IndexedDB / WatermelonDB**
- **IndexedDB**: Banco de dados relacional/NoSQL cliente embutido nos navegadores modernos.
- **WatermelonDB**: Framework de banco de dados reativo de alta velocidade que gerencia o armazenamento local offline no aplicativo PaletScan PWA.

---

## 🔤 M - P

### **Modulus 10 (GS1 Mod10)**
Algoritmo matemático estipulado pela organização GS1 para calcular e verificar o último dígito (dígito verificador) de códigos EAN-13, EAN-8 e DUN-14, prevenindo erros de digitação e leituras inválidas de scanners.

### **Placeholder (Indicador / Imagem de Substituição)**
Elemento visual temporário ou imagem padrão utilizada na interface da aplicação quando o recurso principal ainda não está disponível ou o produto não possui foto cadastrada (ex: status `sem_imagem`).

### **PWA (Progressive Web App / Aplicativo Web Progressivo)**
Aplicação web construída com tecnologias modernas (como Service Workers e IndexedDB) que oferece experiência idêntica à de um aplicativo nativo, incluindo suporte a uso 100% offline em dispositivos móveis e coletores industriais.

---

## 🔤 R - S

### **rembg / U2Net / ONNX**
- **rembg**: Biblioteca Python utilizada para remoção automatizada de fundo em imagens.
- **U2Net**: Arquitetura de rede neural profunda treinada para segmentação de saliência de objetos.
- **ONNX**: Formato aberto para representação de modelos de Machine Learning executados localmente de forma otimizada.

### **REST API (Representational State Transfer API)**
Interface de comunicação baseada no protocolo HTTP utilizada pelos scrapers e pelo aplicativo para consultar e enviar dados estruturados em formato JSON.

### **Scraper / Web Scraping**
Técnica automatizada de engenharia de dados que extrai informações, catálogos e mídias diretamente de websites, APIs B2B e portais e-commerce de fabricantes.

### **Service Worker**
Script que o navegador executa em segundo plano, separado da página web, responsável por interceptar requisições de rede, gerenciar caches offline e permitir o funcionamento do PWA sem conexão com a internet.

### **SKU (Stock Keeping Unit / Unidade de Manutenção de Estoque)**
Código identificador único de controle interno de inventário atribuído a um produto específico por um fornecedor ou fabricante.

### **Slug**
Versão de um texto amigável para URLs, convertida em letras minúsculas, sem acentos e separada por hífens (ex: `"coxinha-da-asa-resfriada"`).

### **Staging (Ambiente / Arquivo Intermediário de Preparação)**
Camada intermediária do pipeline onde os dados brutos recém-extraídos são armazenados temporariamente em arquivos JSON sanitizados (`staging/*_staging.json`) antes de passarem pela validação relacional e carga no banco final.

---

## 🔤 T - U

### **Truncamento (Truncamento de Zeros)**
Erro comum em bancos de dados ou linguagens de programação quando um código numérico iniciado por zero (ex: `"07891515..."`) é convertido indevidamente para o tipo inteiro (`integer`), resultando na perda do zero à esquerda (`7891515...`).

### **Upsert (Update + Insert)**
Operação relacional no banco de dados que insere um novo registro se ele não existir ou atualiza o registro existente caso a chave primária/única já conste na tabela.

### **UUIDv5 (Universally Unique Identifier Version 5)**
Identificador único universal de 128 bits gerado deterministicamente por meio do algoritmo de hash SHA-1 a partir de um namespace fixo e de uma chave natural (como o código EAN ou SKU).

### **WebP**
Formato moderno de imagem desenvolvido pela Google que oferece compressão superior com e sem perdas, reduzindo drasticamente o tamanho dos arquivos visuais mantendo excelente qualidade.
