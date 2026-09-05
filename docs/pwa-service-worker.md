# ⚡ Service Worker & Resiliência Offline

O **PaletScan PWA** foi concebido para resolver o problema clássico de conectividade em depósitos industriais: **o isolamento térmico das câmaras frigoríficas atua fisicamente como uma Gaiola de Faraday**, bloqueando sinais Wi-Fi e redes móveis (4G/5G).

---

## ❄️ 1. O Desafio da Câmara Frigorífica

```mermaid
flowchart TD
    A1["❄️ 1. Interior da Câmara Frigorífica (Blackout de Sinal)\nColetor ou Smartphone Android em Modo Offline"]
    
    A1 --> A2["📱 2. App Shell e Login Servidos pelo Serwist Cache\nAbertura instantânea da interface sem sinal de rede"]
    
    A2 --> A3["💾 3. Catálogo e Validação no WatermelonDB Local\nBipagem e gravação reativa em menos de 5 milissegundos"]
    
    A3 --> A4["📥 4. Enfileiramento na Fila de Contingência Local\nPersistência em pending_criacoes e pending_sync"]
    
    A4 --> B1["🚪 5. Saída da Câmara e Retomada de Sinal\nReconexão detectada com Wi-Fi ou rede 4G e 5G"]
    
    B1 --> B2["⚡ 6. Instant Sync Delta com Supabase Cloud\nSincronização bidirecional em menos de 30 milissegundos"]
    
    B2 --> B3["🧹 7. Despacho e Expurgo Atômico da Fila Local\nEvita qualquer envio duplicado de paletes"]
```

---

## 🛠️ 2. Motor de Service Worker (`sw.ts` / `@serwist/next`)

O gerenciamento de cache é orquestrado pelo **Serwist**, compilado em tempo de build:

```typescript
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import { Serwist, NetworkFirst, NetworkOnly, CacheFirst } from 'serwist';

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  fallbacks: {
    entries: [
      {
        url: '/',
        matcher({ request }) {
          return request.mode === 'navigate';
        },
      },
    ],
  },
  runtimeCaching: [
    {
      // 1. Não cacheia rotas de mutação de API
      matcher: ({ url }) => url.pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
    {
      // 2. Navegação suave do App Shell e Login com fallback offline
      matcher: ({ request, url }) => request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/login',
      handler: new NetworkFirst({
        cacheName: 'offline-pages',
        networkTimeoutSeconds: 3,
      }),
    },
    {
      // 3. CacheFirst para imagens: economia extrema de tráfego de rede móvel
      matcher: ({ request, url }) =>
        request.destination === 'image' ||
        url.pathname.startsWith('/imagens_produtos/') ||
        url.hostname.includes('supabase.co') ||
        /\.(?:png|jpg|jpeg|svg|webp|gif|bmp|ico)/i.test(url.pathname),
      handler: new CacheFirst({
        cacheName: 'product-images-cache-v2',
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
```

---

## 🗄️ 3. Banco de Dados Local-First (WatermelonDB & IndexedDB)

Diferente de soluções convencionais que utilizam apenas o `localStorage` (limitado a 5MB e síncrono), o PaletScan utiliza o **WatermelonDB** construído sobre adaptadores **IndexedDB / LokiJS**:

* **Zero Latência**: Leitura e escrita completas em menos de 5 milissegundos.
* **Invalidação de Hash e Propagação de DUNs**: O sincronizador compara a assinatura de hash do catálogo remoto e invalida o cache local somente quando há mutações reais, forçando a propagação imediata de vínculos de DUN-14 para o IndexedDB móvel.
* **Fila de Contingência `pending_sync`**: Caso ocorra instabilidade de rede no envio para o Supabase, as mutações são preservadas localmente e despachadas automaticamente ao restabelecer o sinal.

---

## 🛡️ 4. Fila Offline `pending_criacoes` & Expurgo Imediato Anti-Duplicação

Um dos desafios mais sutis em aplicações móveis industriais é a **duplicação de registros por sincronização concorrente**.

### O Cenário de Corrida (Race Condition):
1. O operador bipa e salva um palete com a rede online.
2. Como salvaguarda contra quedas imprevistas de Wi-Fi, o aplicativo imediatamente coloca o palete na fila IndexedDB `pending_criacoes` via [`lib/paleteOfflineHistorico.ts`](file:///root/repo_pwa/lib/paleteOfflineHistorico.ts).
3. A requisição HTTP para a API `/api/paletes-historico` completa com sucesso em ~200ms.
4. Ao receber o retorno positivo, o fluxo chamava a sincronização de pendências em segundo plano.
5. Se o item ainda residisse na fila local, o sincronizador o enviava uma segunda vez ao Supabase com diferença de poucas centenas de milissegundos!

### A Solução: Expurgo Atômico Imediato (`removerCriacoesPendentes`):
Para eliminar essa brecha, foi implementada a rotina de expurgo imediato:

```mermaid
flowchart TD
    SAVE["💾 Operador Clica em Salvar Palete"]
    
    SAVE --> ENQUEUE["1. Enfileira na fila local de contingência pending_criacoes\nGarante sobrevivência da carga caso a rede caia no milissegundo seguinte"]
    
    ENQUEUE --> HTTP["2. Dispara POST para a API de historico"]
    
    HTTP --> RES{"Resposta HTTP 200 OK?"}
    
    RES -->|Sim| PURGE["3. Invoca removerCriacoesPendentes(paleteId)\nItem é EXPURGADO do IndexedDB antes de qualquer sync concorrente"]
    
    PURGE --> SYNC_SAFE["4. Sincronizador de fundo não encontra duplicatas\nNenhum duplo envio ocorre no Supabase"]
    
    RES -->|Não ou Falha de Rede| KEEP["5. Item Permanece na Fila Local\nSerá sincronizado automaticamente na reconexão física"]
```

---

## ⏱️ 5. Barreira de Idempotência no Backend (`paleteLifecycle.ts`)

Como rede industrial em galpões de alvenaria e câmaras frigoríficas pode reenviar pacotes TCP ou o operador pode dar duplo clique rápido no botão tátil do smartphone, o backend implementa uma **Barreira de Idempotência Temporal de 30 Segundos**:

```mermaid
flowchart TD
    REQ["📥 Requisição de Registro de Evento\n(CRIACAO_PALETE, CRIACAO ou ADICAO_PRODUTO)"]
    
    REQ --> MEM{"Existe evento com mesmo palete_id, câmara e vaga\ngravado nos últimos 30 segundos?"}
    
    MEM -->|Sim| DUP["⚠️ Evento Duplicado Detectado\nDescarta a requisição silenciosamente sem erro e sem poluir o histórico"]
    
    MEM -->|Não| WRITE["💾 Grava Evento em paletes_historico e logs_sessao\nAtualiza o cache temporal de idempotência"]
```

* **Escopo da Proteção**: Eventos de criação inicial e adições de produtos ficam blindados contra reenvios acidentais.
* **Janela Temporal Calibrada**: O período de 30 segundos cobre confortavelmente oscilações de conexão e retentativas automáticas de Service Workers e navegadores.

---

## 📐 6. Invariantes Estritos de Schema do WatermelonDB

Para evitar travamentos silenciosos no motor de banco local no smartphone:
* Colunas de carimbo de tempo gerenciadas pelo motor (como `updated_at` e `created_at`) devem ser estritamente do tipo `number` e **não opcionais** (`isOptional: false`).
* Qualquer migração ou schema que marque `updated_at` como opcional dispara erro de invariante no WatermelonDB (`Diagnostic error: updated_at must be of type number and not optional`).
* A arquitetura garante que todos os schemas e migrações sigam rigorosamente a tipagem numérica invariante.

