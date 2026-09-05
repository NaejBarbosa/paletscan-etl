# 📱 Visão Geral da Aplicação PWA Local-First

O **PaletScan PWA** é a interface operacional de chão de fábrica do ecossistema, projetada para operadores de empilhadeira, conferentes e auditores de estoque atuando no setor de perecíveis (câmaras de congelados e resfriados).

---

## 🎯 1. Principais Funcionalidades da Aplicação

A esteira de módulos operacionais do aplicativo está estruturada em fluxo sequencial vertical:

```mermaid
flowchart TD
    APP["📱 PaletScan PWA (Next.js 14 Local-First)"]

    APP --> M1["🔍 1. Módulo de Leitura e Scanner"]
    M1 --> D1["Leitura ao Vivo (ZXing) & Recorte Tátil com Zoom Anti-Névoa"]

    D1 --> M2["⚙️ 2. Módulo de Regex Industrial"]
    M2 --> D2["Decodificação GS1-128, Data Matrix Lar (+365d), BRF & Balança"]

    D2 --> M3["🏢 3. Módulo de Endereçamento Rígido"]
    M3 --> D3["Zoneamento 4 Caracteres & Prevenção Ativa de Colisão Realtime"]

    D3 --> M4["🎯 4. Módulo de Radar Watchlist"]
    M4 --> D4["Busca Estrita EAN/DUN, Sincronização Cross-Session e Proteção Canônica"]

    D4 --> M5["📋 5. Módulo de Conferência & Ciclos de Vida"]
    M5 --> D5["Motor de Histórico por Vaga, Checklist Físico e Relatórios PDF/CSV"]

    D5 --> M6["🔒 6. Módulo de Autenticação & Telemetria"]
    M6 --> D6["Passkeys, Barreira de Marcas, Eruda DevTools Móvel e logs_sessao"]
```

---

## ⚡ 2. Diferenciais do PWA no Ambiente Frigorífico

1. **Fullscreen Edge-to-Edge & Safe Area Insets**:
   - Funciona em tela cheia com respeito às variáveis de ambiente CSS `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`, garantindo visualização desimpedida em celulares com entalhes (*notch*), ilhas dinâmicas ou botões virtuais de navegação.
2. **Barra Superior Minimalista & Ergonomia**:
   - Cabeçalho limpo com identificação visual do app e versão, mantendo detalhes de login organizados na área de configurações.
3. **Alerta Flutuante de Modo Offline em Alto Contraste**:
   - Indicador de status de rede calibrado com paleta luminosa para câmaras escuras, posicionado estrategicamente para não cobrir botões de ação e leitura.
4. **Design Ergonômico de Alta Densidade (*Touch-First*)**:
   - Botões ampliados e layout em contraste elevado (paletas *Slate/Dark*) adequados para operação com luvas térmicas em temperaturas negativas (-18°C a -25°C).
5. **Leitura Resiliente a Condensação e Reflexos**:
   - Ferramenta integrada de recorte manual (`react-zoom-pan-pinch`) para leitura de códigos em paletes com filme stretch embaçado ou amassado.
6. **Alocação Rígida sem Duplicidades & Prevenção de Colisão**:
   - Bloqueio ativo de confirmação via polling (4s) e escuta WebSocket no Supabase Realtime, impedindo que múltiplos operadores (coletor vs desktop) sobreponham cargas na mesma coordenada física.
7. **Isolamento de Ciclos de Vida por Vaga**:
   - O histórico de paletes antigos que já deixaram a câmara não contamina o palete recém-alocado, eliminando registros duplicados no histórico e no desktop.

