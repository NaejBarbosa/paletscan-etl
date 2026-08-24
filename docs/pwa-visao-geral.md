# 📱 Visão Geral da Aplicação PWA Local-First

O **PaletScan PWA** é a interface operacional de chão de fábrica do ecossistema, projetada para operadores de empilhadeira, conferentes e auditores de estoque atuando no setor de perecíveis (câmaras de congelados e resfriados).

---

## 🎯 1. Principais Funcionalidades da Aplicação

```mermaid
flowchart TD
    A["PaletScan PWA (Next.js 14)"] --> B["1. Scanner e Recorte Óptico"]
    A --> C["2. Funil Regex Industrial"]
    A --> D["3. Seletor de Vagas em 4 Caracteres"]
    A --> E["4. Radar de Validades e Multi-Watchlists"]
    A --> F["5. Modo Conferência Física"]
    A --> G["6. Autenticação Híbrida e Passkeys"]
    
    B --> H["Leitura de Câmera e Recorte Interativo"]
    C --> I["GS1-128, Data Matrix Lar (+365d), BRF e Pesagem"]
    D --> J["Bloqueio de Ocupação Duplicada (R1/R2/C1/C2)"]
    E --> K["Busca Fuzzy e Celebração com Confetes"]
    F --> L["Checklist Tátil, Expurgo em Massa e Relatórios"]
    G --> M["Biometria FIDO2 e Cache de Sessão Offline"]
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
