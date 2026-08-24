# 📱 Visão Geral da Aplicação PWA Local-First

O **PaletScan PWA** é a interface operacional de chão de fábrica do ecossistema, projetada para operadores de empilhadeira, conferentes e auditores de estoque atuando no setor de perecíveis (câmaras de congelados e resfriados).

---

## 🎯 1. Principais Funcionalidades da Aplicação

A arquitetura de recursos do PWA está estruturada em módulos verticais especializados:

```mermaid
flowchart TD
    APP["📱 PaletScan PWA (Next.js 14 Local-First)"]

    APP --> M1["🔍 1. Módulo de Leitura e Scanner"]
    M1 --> D1["Leitura de Câmera em Tempo Real & Recorte Manual de Rótulos"]

    APP --> M2["⚙️ 2. Módulo de Regex Industrial"]
    M2 --> D2["Decodificação GS1-128, Data Matrix Lar (+365d), BRF & Balança"]

    APP --> M3["🏢 3. Módulo de Endereçamento Rígido"]
    M3 --> D3["Zoneamento em 4 Caracteres & Bloqueio Ativo de Vaga Ocupada"]

    APP --> M4["🎯 4. Módulo de Radar Watchlist"]
    M4 --> D4["Busca Fuzzy Fonética & Celebração Visual de Localização com Confetes"]

    APP --> M5["📋 5. Módulo de Conferência & Auditoria"]
    M5 --> D5["Checklist Físico Tátil, Expurgo em Massa & Relatórios PDF/CSV"]

    APP --> M6["🔒 6. Módulo de Autenticação & Segurança"]
    M6 --> D6["Biometria WebAuthn (Passkeys) & Cache Seguro de Sessão Offline"]
```

---

## ⚡ 2. Diferenciais do PWA no Ambiente Frigorífico

1. **Instalável e Sem Distrações (*Standalone Mode*)**:
   - Funciona como um app nativo no Android, ocultando barras de endereço do navegador para maximizar o espaço útil da tela e evitar toques acidentais.
2. **Design Ergonômico de Alta Densidade (*Touch-First*)**:
   - Botões ampliados e layout em contraste elevado (paletas *Slate/Dark*) adequados para operação com luvas térmicas em ambientes escuros.
3. **Leitura Resiliente a Condensação e Reflexos**:
   - Ferramenta integrada de recorte manual (`react-zoom-pan-pinch`) para leitura de códigos em paletes com filme stretch embaçado ou amassado.
4. **Alocação Rígida sem Duplicidades**:
   - Bloqueio ativo de confirmação caso o operador tente alocar um novo palete em uma coordenada física já ocupada por outra carga.
