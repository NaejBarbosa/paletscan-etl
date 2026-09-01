# 🔍 Leitor Óptico & Funil de Regex Industrial

O módulo de leitura visual e decodificação do **PaletScan PWA** combina o leitor de câmera com um funil de expressões regulares industriais especializado nas normas internacionais GS1 e particularidades de fornecedores alimentícios.

---

## 📷 1. Componente Leitor Óptico (`Scanner.tsx`)

```mermaid
flowchart TD
    START["📷 Operador Inicia o Scanner no PWA"]

    START --> CAM["1. Leitura de Câmera em Tempo Real"]
    CAM --> C1["Biblioteca ZXing e BarcodeDetector API"]
    C1 --> C2["Mira Laser Animada e Lanterna LED"]

    START --> UPL["2. Upload de Foto com Recorte"]
    UPL --> U1["Recorte Interativo (react-zoom-pan-pinch)"]
    U1 --> U2["Zoom Tátil para Isolar Rótulos com Reflexo ou Névoa"]

    C2 --> DEC["🔍 Decodificação Óptica Bruta"]
    U2 --> DEC

    DEC --> REG["⚙️ Funil de Regex Industrial (lib/regex.ts)"]
    REG --> AUTO["✅ Preenchimento Automático (EAN, Validade, Lote e Peso)"]
```

---

## 🧩 2. Motor de Regex Industrial (`lib/regex.ts`)

### A. Tabela de Identificadores GS1 e Regras Especiais

| Identificador (AI) | Significado | Exemplo de Leitura | Ação Executada pelo Sistema |
| :--- | :--- | :--- | :--- |
| `(01)` ou `01` | GTIN-14 / DUN-14 | `0107891000123456` | Identifica a caixa máster ou produto de 14 dígitos. |
| `(17)` ou `17` | Data de Vencimento | `17260830` | Converte `260830` em validade formatada `30/08/2026`. |
| `(10)` ou `10` | Lote de Fabricação | `10L2026A` | Associa a string ao campo de lote do palete. |
| `(11)` ou `11` | Data de Fabricação (Marca Lar) | `11250830` | Quando o AI 17 está ausente, o sistema calcula automaticamente a validade sugerida de **+365 dias**. |
| `(310X)` / `(pesar)` | Pesagem Variável | `3102001550` | Detecta peso em balança e abre o campo de quilos no formulário. |

### B. Normalização de Zeros à Esquerda
O motor padroniza variações de formatação de códigos EAN/DUN de indústrias como **Friboi / JBS**, permitindo a correspondência perfeita com o catálogo master gerado pelo pipeline ETL.

---

## 📐 3. Validação Matemática GS1 Módulo 10 (`lib/gs1Validator.ts`)

Além de extrair códigos por padrões regex, o sistema executa a validação matemática estrita da norma **GS1 Módulo 10** em tempo de digitação e bipagem:

* **Validação de DUN-14**: Exige 14 dígitos numéricos estritos e calcula o dígito verificador ponderado. Códigos digitados incorretamente recebem alerta visual imediato (vermelho) prevenindo gravações incorretas.
* **Validação de EAN-13**: Garante que o dígito de controle do produto comercial seja matematicamente válido antes de permitir a associação de novos SKUs.
* **Detecção de Correlação EAN x DUN**: Avalia matematicamente se um código DUN-14 é uma variante direta (`variante_direta`) ou agrupamento logístico (`caixa_distribuicao`) do EAN base, evitando associações de produtos diferentes.

