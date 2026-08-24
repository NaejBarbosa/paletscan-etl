# 🏢 Endereçamento Rígido & Zoneamento de Vagas

O sistema de endereçamento do **PaletScan PWA** organiza espacialmente as câmaras frias através de coordenadas de 4 caracteres, prevenindo perdas de tempo na localização de lotes por operadores de empilhadeira.

---

## 📌 1. Composição da Coordenada de Vaga (4 Caracteres)

A coordenada física é decomposta em 4 níveis sequenciais estritamente verticais:

```mermaid
flowchart TD
    COORD["🏷️ Coordenada Física de 4 Dígitos (ex: A10D)"]
    
    COORD --> P1["1º Caractere: Rack (Corredor)"]
    P1 --> D1["Lado da Estrutura (A = Direita, B = Esquerda)"]
    
    D1 --> P2["2º Caractere: Módulo (Coluna)"]
    P2 --> D2["Posição Horizontal (1 a 5 da entrada ao fundo)"]
    
    D2 --> P3["3º Caractere: Gaveta (Nível de Altura)"]
    P3 --> D3["Plano Vertical (0 = Solo, 1 a 3 = Prateleiras Suspensas)"]
    
    D3 --> P4["4º Caractere: Vaga (Posição Lateral)"]
    P4 --> D4["Alocação no Plano (D = Direita, E = Esquerda)"]
```

| Elemento | Significado | Valores | Descrição Operacional |
| :--- | :--- | :--- | :--- |
| **Rack** | Corredor | `A` (Direita) \| `B` (Esquerda) | Lado da estrutura em relação ao corredor de entrada central. |
| **Módulo** | Coluna | `1` a `5` | Posição horizontal da entrada da câmara (1) até o fundo (5). |
| **Gaveta** | Nível/Altura | `0` (Chão) \| `1` \| `2` \| `3` | Nível vertical (`0` = Solo, `1`/`2`/`3` = Prateleiras suspensas). |
| **Vaga** | Posição Lateral | `D` (Direita) \| `E` (Esquerda) | Posição exata do palete dentro do plano da gaveta. |

---

## ❄️ 2. Zoneamento das Câmaras Frigoríficas

```mermaid
flowchart TD
    ZONE["❄️ Zoneamento Industrial de Câmaras Frias"]
    
    ZONE --> R["🥩 Câmaras de Resfriados (0°C a 4°C)"]
    R --> R1["Câmara R1 e Câmara R2"]
    R1 --> VR["Grade Completa de Vagas A10D a B53E"]
    
    VR --> C["🧊 Câmaras de Congelados (-18°C)"]
    C --> C1["Câmara C1 e Câmara C2"]
    C1 --> VC["Grade Completa de Vagas A10D a B53E"]
```

* **Resfriados (`R1` / `R2`)**: Produtos lácteos, embutidos, margarinas e carnes resfriadas (0°C a 4°C).
* **Congelados (`C1` / `C2`)**: Vegetais, pratos prontos, polpas e aves/cortes congelados (-18°C).

---

## 🛑 3. Bloqueio Ativo de Vaga Duplicada

Durante a seleção de vaga no componente `VagaSelector.tsx`, o sistema consulta em milissegundos o banco local WatermelonDB:
- 🟢 **Vaga Livre**: Permite o salvamento imediato.
- 🔴 **Vaga Ocupada**: Trava o botão de confirmação e exibe os dados da carga já alocada, impedindo sobreposição e divergência de inventário.

---

## 🏷️ 4. Protocolo de Sinalização Física
1. **Etiquetas Adesivas**: Duas etiquetas impressas na balança e coladas no primeiro lastro de caixas.
2. **Marcador Vermelho**: Escrita manual da identificação (ex: `R1-A32E` ou `C2-B20D`).
3. **Frente e Verso**: Visibilidade garantida para o operador de empilhadeira em qualquer sentido de circulação.
