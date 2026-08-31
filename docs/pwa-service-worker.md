# ⚡ Service Worker & Resiliência Offline

O **PaletScan PWA** foi concebido para resolver o problema clássico de conectividade em depósitos industriais: **o isolamento térmico das câmaras frigoríficas atua fisicamente como uma Gaiola de Faraday**, bloqueando sinais Wi-Fi e redes móveis (4G/5G).

---

## ❄️ 1. O Desafio da Câmara Frigorífica

```mermaid
flowchart TD
    subgraph CamaraFria ["1. Interior da Câmara Frigorífica (Blackout de Sinal)"]
        A1["Coletor ou Smartphone Android em Modo Offline"]
        A2["App Shell e Tela de Login Servidos pelo Serwist"]
        A3["Catálogo Mestre Lido do WatermelonDB Local"]
        A4["Bipagem e Gravação Reativa Local em menos de 5ms"]
        A5["Fila pending_sync Enfileira Mutações no localStorage"]

        A1 --> A2 --> A3 --> A4 --> A5
    end

    subgraph Reconexao ["2. Saída da Câmara e Retorno da Conectividade"]
        B1["Reconexão com Wi-Fi ou Rede Móvel 4G/5G"]
        B2["Instant Sync com Supabase Cloud em menos de 30ms"]
        B3["Despacho Automático das Mutações da Fila pending_sync"]

        B1 --> B2 --> B3
    end

    A5 -->|Ao Detectar Conexão| B1
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
