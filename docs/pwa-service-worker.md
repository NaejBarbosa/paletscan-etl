# ⚡ Service Worker & Resiliência Offline

O **PaletScan PWA** foi concebido para resolver o problema clássico de conectividade em depósitos industriais: **o isolamento térmico das câmaras frigoríficas atua fisicamente como uma Gaiola de Faraday**, bloqueando sinais Wi-Fi e redes móveis (4G/5G).

---

## ❄️ 1. O Desafio da Câmara Frigorífica

```
 +-------------------------------------------------------------------------------+
 |                       CÂMARA FRIGORÍFICA (PAINÉIS METÁLICOS)                  |
 |                                                                               |
 |   [Sinal Wi-Fi / 4G Bloqueado] ➔ 🚫 (Zona Cega)                               |
 |                                                                               |
 |   +-----------------------------------------------------------------------+   |
 |   |                      COLETOR / SMARTPHONE ANDROID                     |   |
 |   |                                                                       |   |
 |   |   1. App Shell Servido Instantaneamente do Service Worker (Serwist)   |   |
 |   |   2. Catálogo Master Lido do WatermelonDB Local (IndexedDB)           |   |
 |   |   3. Bipagem & Gravação Local em < 5ms                                |   |
 |   |   4. Fila pending_sync Enfileira Mutações sem Conexão                |   |
 |   +-----------------------------------------------------------------------+   |
 +-------------------------------------------------------------------------------+
                                          │
                         Ao sair da câmara (Reconexão com Wi-Fi/4G)
                                          ▼
 +-------------------------------------------------------------------------------+
 |                     SINCRONIZAÇÃO AUTOMÁTICA COM SUPABASE CLOUD              |
 |                     (Instant Sync em < 30ms via Hash Check)                   |
 +-------------------------------------------------------------------------------+
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
      // 2. Navegação suave do App Shell com fallback offline
      matcher: ({ request, url }) => request.mode === 'navigate' || url.pathname === '/',
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

## 🗄️ 3. Banco de Dados Local-First (WatermelonDB Schema v11)

Diferente de soluções convencionais que utilizam apenas o `localStorage` (limitado a 5MB e síncrono), o PaletScan utiliza o **WatermelonDB** construído sobre adaptadores **IndexedDB / LokiJS**:

* **Zero Latência**: Leitura e escrita completas em menos de 5 milissegundos.
* **Escala para Grandes Volumes**: Suporte comprovado para mais de 100.000 SKUs armazenados no cliente.
* **Fila de Contingência `pending_sync`**: Caso ocorra instabilidade de rede no envio para o Supabase, as mutações são preservadas localmente e despachadas automaticamente ao restabelecer o sinal.
