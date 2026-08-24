# 🏢 Endereçamento Rígido & Zoneamento de Vagas

O sistema de endereçamento do **PaletScan PWA** organiza espacialmente as câmaras frias através de coordenadas de 4 caracteres, prevenindo perdas de tempo na localização de lotes por operadores de empilhadeira.

---

## 📌 1. Composição da Coordenada de Vaga (4 Caracteres)

```mermaid
flowchart TD
    A["Coordenada Física de 4 Caracteres (ex: A10D)"] --> B["1º Caractere: Rack (A = Direita, B = Esquerda)"]
    A --> C["2º Caractere: Módulo / Coluna (1 a 5 da entrada ao fundo)"]
    A --> D["3º Caractere: Gaveta / Nível (0 = Chão, 1 a 3 = Prateleiras)"]
    A --> E["4º Caractere: Vaga / Posição (D = Direita, E = Esquerda)"]
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
    subgraph Resfriados ["Câmaras de Resfriados (0°C a 4°C)"]
        R1["Resfriados 1 (R1)"]
        R2["Resfriados 2 (R2)"]
    end

    subgraph Congelados ["Câmaras de Congelados (-18°C)"]
        C1["Congelados 1 (C1)"]
        C2["Congelados 2 (C2)"]
    end

    R1 --> V1["Coordenadas A10D a B53E"]
    R2 --> V1
    C1 --> V2["Coordenadas A10D a B53E"]
    C2 --> V2
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
