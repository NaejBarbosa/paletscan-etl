# 🔍 Leitor Óptico, Funil de Regex Industrial & Barreira de Marcas

O módulo de leitura visual e decodificação do **PaletScan PWA** ([`Scanner.tsx`](file:///root/repo_pwa/components/Scanner.tsx)) combina o motor de leitura óptica da câmera com um funil especializado de expressões regulares industriais (normas GS1-128 e Data Matrix), validação matemática GS1 Módulo 10 e barreira imediata de marcas permitidas para promotores restritos.

---

## 📷 1. Componente Leitor Óptico & Fluxo Operacional

```mermaid
flowchart TD
    START["📷 Operador Inicia o Scanner no PWA\n(Câmera ao Vivo ou Foto com Recorte Tátil)"]
    
    START --> CAPTURE["1. Captura Visual e Leitura do Sensor Óptico\n(ZXing BarcodeDetector + Zoom tátil anti-névoa)"]
    
    CAPTURE --> RAW_DEC["2. Decodificação da String Bruta\n(Ex: '01078910001234561726083010L2026A')"]
    
    RAW_DEC --> FUNNEL["3. Funil de Regex Industrial (lib/regex.ts)\nExtração de GTIN (01), Validade (17), Lote (10) e Peso (310X)"]
    
    FUNNEL --> VAL_MATH["4. Validação Matemática GS1 Módulo 10 (lib/gs1Validator.ts)\nRecálculo ponderado do Dígito Verificador do EAN/DUN"]
    
    VAL_MATH --> BRAND_GUARD{"5. Barreira de Segurança de Marcas:\nO produto pertence a marcasPermitidas do operador?"}
    
    BRAND_GUARD -->|Não - Marca Concorrente| REJECT["🚫 BLOQUEIO IMEDIATO NO SCANNER\nStatus: unauthorized_brand\n- Alerta visual em alto contraste (Vermelho)\n- Toca som e feedback háptico de erro\n- Aborta imediatamente abertura do formulário"]
    
    BRAND_GUARD -->|Sim - Marca Autorizada ou Admin| AUTOFILL["✅ 6. Preenchimento Automático do Formulário de Palete\nEAN, Validade, Lote, Peso e Vaga física preenchidos em < 5ms"]
```

---

## 🧩 2. Motor de Regex Industrial (`lib/regex.ts`)

O motor de expressões regulares atua em pipeline sequencial vertical, tratando diferentes padrões de indústrias alimentícias sem gerar falsos positivos:

```mermaid
flowchart TD
    INPUT_STR["📥 String Bruta Decodificada do Código de Barras"]
    
    INPUT_STR --> D1{"Contém Identificadores de Aplicação GS1\n(AI 01, 17, 10, 310X)?"}
    
    D1 -->|Sim| P_GS1["Padrão GS1 Oficial:\nExtrai GTIN (01), Validade (17) e Lote (10)"]
    
    D1 -->|Não| D2{"Padrão Cooperativa Lar\n(Data Matrix com AI 11 de Fabricação sem 17)?"}
    
    D2 -->|Sim| P_LAR["Regra Específica Marca Lar:\nData de Validade = Data de Fabricação + 365 Dias"]
    
    D2 -->|Não| D3{"Padrão Frigorífico Friboi / JBS\n(Zeros à esquerda redundantes ou código emendado)?"}
    
    D3 -->|Sim| P_FRIBOI["Normalização Friboi:\nRemove zeros à esquerda e isola EAN-13 ou DUN-14"]
    
    D3 -->|Não| P_DIRECT["Extração Numérica Pura:\nValida EAN-13 padrão de consumo direto"]
    
    P_GS1 --> MERGE_REGEX["⚙️ Consolidação e Validação Estruturada dos Dados"]
    P_LAR --> MERGE_REGEX
    P_FRIBOI --> MERGE_REGEX
    P_DIRECT --> MERGE_REGEX
```

### Tabela de Identificadores GS1 e Regras Especiais:

| Identificador (AI) | Significado | Exemplo de Leitura | Ação Executada pelo Sistema |
| :--- | :--- | :--- | :--- |
| `(01)` ou `01` | GTIN-14 / DUN-14 | `0107891000123456` | Identifica a caixa máster ou fardo de distribuição de 14 dígitos. |
| `(17)` ou `17` | Data de Vencimento | `17260830` | Converte `260830` em validade formatada `30/08/2026`. |
| `(10)` ou `10` | Lote de Fabricação | `10L2026A` | Associa a cadeia alfanumérica ao campo de lote do palete. |
| `(11)` ou `11` | Data de Fabricação (Marca Lar) | `11250830` | Na ausência do AI 17, projeta automaticamente **+365 dias** de validade. |
| `(310X)` / `(pesar)` | Pesagem Variável | `3102001550` | Identifica peso em balança e abre o campo de quilos no formulário. |

---

## 📐 3. Validação Matemática GS1 Módulo 10 (`lib/gs1Validator.ts`)

Além de extrair códigos por padrões regex, o sistema executa a validação matemática estrita da norma **GS1 Módulo 10** em tempo real:

* **Validação de DUN-14**: Exige 14 dígitos numéricos estritos e calcula o dígito verificador ponderado. Códigos digitados incorretamente recebem alerta visual imediato prevenindo gravações incorretas.
* **Validação de EAN-13**: Garante que o dígito de controle do produto comercial seja matematicamente válido antes de permitir a associação de novos SKUs.
* **Detecção de Correlação EAN x DUN**: Avalia matematicamente se um código DUN-14 é uma variante direta (`variante_direta`) ou agrupamento logístico (`caixa_distribuicao`) do EAN base, evitando associações de produtos diferentes.

---

## 🚫 4. Bloqueio no Scanner para Marcas Concorrentes

Quando um promotor (ex: **Sadia**) bipa um produto concorrente (ex: **Seara**):
1. O scanner decodifica o código com sucesso.
2. Consulta o catálogo local pré-sincronizado ou a API de validação.
3. Ao identificar a marca divergente, aciona o status `unauthorized_brand`.
4. Exibe o alerta vermelho na tela:
   > *"Produto de marca não autorizada. Seu acesso nesta filial está restrito a: [Marcas Permitidas]."*
5. A câmera permanece ativa para a leitura do próximo item sem travar a interface e sem expor informações de estoque ou validade do produto concorrente.
