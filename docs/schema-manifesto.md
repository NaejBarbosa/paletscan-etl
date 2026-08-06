# 📜 Governança de Dados e Manifesto de Schema

O módulo de governança do **PaletScan ETL** assegura que nenhum dado corrompido, órfão ou fora de contrato seja inserido no banco de dados relacional. Ele combina contratos formais em JSON Schema ([`schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json)) com identificadores determinísticos UUIDv5 e funções de sanitização em PL/pgSQL no PostgreSQL / Supabase.

---

## 📊 1. Relação Atual de Métricas e Volumes no Banco de Dados

Após a execução do pipeline de ingestão e sanitização estrita, a base de dados relacional encontra-se auditada e 100% íntegra, apresentando a seguinte relação de volumes:

| Entidade Relacional | Quantidade Auditada | Descrição / Regra de Negócio |
| :--- | :--- | :--- |
| **Fabricantes (Holdings)** | **4** | JBS S.A., Seara Alimentos LTDA, BRF S.A. e Cooperativa Agroindustrial Lar. |
| **Marcas Comerciais** | **141** | Marcas ativas associadas (ex: Friboi, Seara, Sadia, Perdigão, Lar, Maturatta, 1953). |
| **Produtos Validados** | **3.001** | Todos 100% respaldados por EAN numérico único (0 produtos órfãos ou sem EAN). |
| **Códigos de Barras** | **8.495** | Registros catalogados e normalizados nas tipagens estritas `EAN` (5.920) e `DUN` (2.575). |

---

## 🏛️ 2. Modelo Relacional Anti-Redundância

O modelo de dados do PaletScan foi desenhado para eliminar duplicidades e garantir a integridade entre fornecedores, marcas, SKUs e variações logísticas de código de barras:

```mermaid
erDiagram
    FABRICANTES ||--o{ MARCAS : "possui"
    MARCAS ||--o{ PRODUTOS : "categoriza"
    PRODUTOS ||--o{ CODIGOS_BARRAS : "associa"

    FABRICANTES {
        uuid id PK "UUIDv5 Deterministico"
        string nome "Razao Social / Holding"
        string cnpj "CNPJ do Fabricante"
    }

    MARCAS {
        uuid id PK "UUIDv5 Deterministico"
        uuid fabricante_id FK
        string nome "Nome Comercial da Marca"
    }

    PRODUTOS {
        uuid id PK "UUIDv5 Deterministico"
        uuid marca_id FK
        string nome "Nome Normalizado (Title Case)"
        string categoria "Categoria Logistica"
        string conservacao "Tipo de Conservacao"
        integer peso_gramas "Peso Fixo em Gramas"
        boolean peso_variavel "Flag de Corte por Pesagem"
        string imagem_url "URL CDN Supabase Storage"
        string imagem_status "aprovado | sem_imagem | pendente"
    }

    CODIGOS_BARRAS {
        uuid id PK "UUIDv5 Deterministico"
        uuid produto_id FK
        string codigo UK "EAN / DUN / SKU (VARCHAR Estrito)"
        string tipo "EAN | DUN | SKU (Tipagem Normalizada)"
        integer quantidade_embalagem "Fator de Embalagem"
    }
```

---

## 📑 3. Manifesto JSON Schema (`schema_manifest.json`)

O arquivo [`core/manifest/schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json) define o contrato formal (JSON Schema Draft-07) que todo arquivo de staging deve respeitar rigorosamente antes do processo de carga no banco.

### Principais Regras de Integridade:
- **Filtro Estrito de EAN Obrigatório**: Todo produto ingerido no banco de dados DEVE possuir obrigatoriamente ao menos um código de barras EAN válido (`EAN-13` / `EAN-8`). Produtos exclusivamente com SKU interno/código de catálogo são filtrados e descartados na fase de transformação.
- **Normalização de Tipagem de Códigos (`EAN` e `DUN`)**: Códigos extraídos como `EAN_13` ou `EAN_8` são padronizados para `EAN`; códigos logísticos `DUN_14` são padronizados para `DUN`. Essa conversão assegura que as Views SQL do Supabase (`vw_produtos_com_marcas`) e o processo de sincronização PWA identifiquem os códigos sem inconsistência.
- **Tipos de Dados Estritos**: Atributos de identificação e códigos de barras são declarados obrigatoriamente como `string`.
- **Prevenção de Truncamento**: Proíbe a coerção de códigos de barras iniciados em zero para tipos numéricos (`integer`/`number`).
- **Validação de Formato**: Exige a especificação do tipo de código de barras (`EAN`, `DUN`, `SKU`) e fatores de conversão de embalagem.

---

## 🔑 4. Identificadores Determinísticos via UUIDv5

Para garantir que reexecuções do pipeline ETL não gerem registros duplicados ou IDs aleatórios a cada sincronização, todos os identificadores primários são gerados via **UUIDv5** a partir de um namespace estático:

$$\text{UUID} = \text{UUIDv5}(\text{PALETSCAN\_NAMESPACE}, \text{Chave\_Natural})$$

Exemplo de chaves naturais utilizadas:
- **Fabricante ID**: `UUIDv5(NAMESPACE, "jbs-friboi")`
- **Marca ID**: `UUIDv5(NAMESPACE, "friboi-reserva")`
- **Produto ID**: `UUIDv5(NAMESPACE, "sku-109403")`
- **Código de Barras ID**: `UUIDv5(NAMESPACE, "ean-7891515432101")`

---

## 🛢️ 5. Higienização SQL em Nível de Banco (`validar_e_corrigir_eans.sql`)

Como camada adicional de proteção e governança, o arquivo [`db_sync/validar_e_corrigir_eans.sql`](file:///root/paletscan-etl/db_sync/validar_e_corrigir_eans.sql) instala a função `fn_calculate_mod10_ean13` diretamente no banco Supabase em PL/pgSQL.

### A. Função PL/pgSQL `fn_calculate_mod10_ean13`
Calcula o 13º dígito verificador Modulus 10 diretamente no motor relacional do PostgreSQL, permitindo sanitizar registros legados importados de planilhas de terceiros.

### B. Correção de Registros Incompletos
Remove caracteres não numéricos de colunas de código, reajusta registros truncados com 12 dígitos para EAN-13 válido e atualiza a coluna `codigo` mantendo a restrição de unicidade (`UNIQUE`).
