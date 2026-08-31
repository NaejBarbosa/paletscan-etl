# 🔒 Autenticação, Passkeys & Permissões

O **PaletScan PWA** dispõe de um sistema de segurança multicamadas que combina autenticação tradicional, biometria via Passkeys, auto-logout por inatividade e controle de acesso baseado em papéis (RBAC), projetado para manter a operação segura e ágil mesmo durante blackouts offline.

---

## 🔐 1. Autenticação Multi-Fator Híbrida & Resiliência Offline

O fluxo de autenticação suporta múltiplos métodos de entrada com garantia de sessão offline:

```mermaid
flowchart TD
    LOGIN["🔐 Tela de Login do PWA (Pré-Cacheada no Service Worker)"]

    LOGIN --> M1["1. Credenciais Tradicionais (Usuário e Senha)"]
    LOGIN --> M2["2. Biometria WebAuthn FIDO2 (Passkeys)"]
    LOGIN --> M3["3. Token QR Code Móvel"]

    M1 --> AUTH["🛡️ Validação com Cache em Memória"]
    M2 --> AUTH
    M3 --> AUTH

    AUTH --> JWT["🎫 Emissão de Sessão JWT"]
    JWT --> CACHE["💾 Armazenamento em Cache Offline (ps_auth_session)"]
    CACHE --> OK["✅ Acesso Seguro Garantido no Interior das Câmaras Frias"]

    OK --> INACT["⏱️ Monitor de Inatividade (5 Minutos)"]
    INACT -->|Sem Interação| LOGOUT["🔒 Auto-Logout & Bloqueio Automático"]
```

### Componentes de Segurança e Sessão:
* **Passkeys / Biometria (WebAuthn)**: Permite login por impressão digital ou reconhecimento facial sem necessidade de digitar senhas com luvas térmicas no frio.
* **Pré-Cache da Tela de Login**: A página de autenticação é precacheada pelo Service Worker, garantindo abertura instantânea mesmo sem sinal de rede.
* **Auto-Logout por Inatividade (5 Minutos)**: Temporizador reativo que encerra a sessão ativa caso o dispositivo fique sem interação no chão de fábrica, evitando registros inadvertidos em coletores compartilhados.
* **Cache em Memória e Resiliência de Variáveis**: O motor de autenticação unifica o suporte a `REDIS_URL` e `VISITOR_PASSWORD`, eliminando latências de autenticação via cache em memória com timeout estrito.
* **Isenção de Expiração para Operadores Fixos**: As credenciais operacionais de administração (como `JeanBfreitas_`) possuem política de não-expiração forçada de senha, prevenindo travamento do turno de trabalho.

---

## 🛡️ 2. Matriz de Controle de Acesso (RBAC)

| Permissão | Flag | Administrador (`operador`) | Visitante (`visitante`) |
| :--- | :--- | :---: | :---: |
| **Painel Administrativo** | `isAdmin` | ✅ | ❌ |
| **Bipar e Consultar** | N/A | ✅ | ✅ (Leitura) |
| **Cadastrar Paletes** | `podeCadastrarPalete` | ✅ | ❌ |
| **Cadastrar SKUs Master** | `podeCadastrarProduto` | ✅ | ❌ |
| **Vincular DUN-14** | `podeVincularDun` | ✅ | ❌ |
| **Editar Vaga de Palete** | `podeEditarVaga` | ✅ | ❌ |
| **Exportar Relatórios** | `podeExportarRelatorio` | ✅ | ❌ |
| **Gerenciar Watchlist** | `podeAdicionarRadar` | ✅ | ❌ |
