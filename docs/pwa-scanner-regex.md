# 🔍 Leitor Óptico & Funil de Regex Industrial

O módulo de leitura visual e decodificação do **PaletScan PWA** combina o leitor de câmera com um funil de expressões regulares industriais especializado nas normas internacionais GS1 e particularidades de fornecedores alimentícios.

---

## 📷 1. Componente Leitor Óptico (`Scanner.tsx`)

```mermaid
flowchart TD
    START["📷 Operador Inicia o Scanner no PWA"]
    
    START --> CAPTURE["1. Captura Visual (Câmera ao Vivo ou Foto com Recorte)\nZXing BarcodeDetector + Zoom tátil anti-névoa"]
    
    CAPTURE --> RAW_DEC["2. Decodificação Óptica da String Bruta\n(Ex: '01078910001234561726083010L2026A')"]
    
    RAW_DEC --> FUNNEL["3. Funil de Regex Industrial (lib/regex.ts)\nExtração dos identificadores de aplicação GS1 (AI)"]
    
    FUNNEL --> VAL_MATH["4. Validação Matemática GS1 Módulo 10\nCálculo do dígito verificador para EAN-13 e DUN-14"]
    
    VAL_MATH --> AUTOFILL["✅ 5. Preenchimento Automático do Formulário\nEAN, Validade, Lote, Peso e Vaga preenchidos em menos de 5ms"]
```

---

## 🧩 2. Motor de Regex Industrial (`lib/regex.ts`)

O motor de expressões regulares atua em pipeline sequencial, tratando diferentes padrões de mercado sem gerar falso positivo:

```mermaid
flowchart TD
    INPUT_STR["📥 String Bruta Decodificada do Código"]
    
    INPUT_STR --> D1{"Contém Identificadores GS1\n(AI 01, 17, 10, 310X)?"}
    
    D1 -->|Sim| P_GS1["Extrai GTIN (01), Validade (17) e Lote (10)"]
    
    D1 -->|Não| D2{"Padrão Cooperativa Lar\n(Data Matrix com AI 11 sem 17)?"}
    
    D2 -->|Sim| P_LAR["Calcula Data de Validade:\nData de Fabricação + 365 Dias"]
    
    D2 -->|Não| D3{"Padrão Frigorífico Friboi ou JBS\n(Zeros à esquerda ou código emendado)?"}
    
    D3 -->|Sim| P_FRIBOI["Normaliza zeros e isola EAN-13 e DUN-14"]
    
    D3 -->|Não| P_DIRECT["Extrai Código Numérico Puro\n(EAN-13 comercial padrão)"]
    
    P_GS1 --> MERGE_REGEX["⚙️ Consolidação dos Dados Estruturados"]
    P_LAR --> MERGE_REGEX
    P_FRIBOI --> MERGE_REGEX
    P_DIRECT --> MERGE_REGEX
```

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

