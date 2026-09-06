const CACHE = "shisen-v18";
const INDEX = "./index.html";
const CORE_ASSETS = [
  INDEX,
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

async function precacheFresh(){
  const cache = await caches.open(CACHE);

  // HTTPキャッシュを避け、GitHub Pages上の最新版を取り込む。
  await Promise.all(
    CORE_ASSETS.map(async url=>{
      try{
        const response = await fetch(url,{cache:"reload"});
        if(response && response.ok){
          await cache.put(url,response.clone());
        }
      }catch(e){
        // 1ファイル失敗してもService Workerのインストール自体は継続。
      }
    })
  );
}

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    await precacheFresh();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key=>key !== CACHE)
        .map(key=>caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message",event=>{
  if(event.data && event.data.type === "SKIP_WAITING"){
    self.skipWaiting();
  }
});

async function networkFirstPage(request){
  try{
    // HTMLは毎回ネットワークを優先し、更新があれば即座に取得。
    const response = await fetch(request,{cache:"no-store"});
    if(response && response.ok){
      const cache = await caches.open(CACHE);
      await cache.put(INDEX,response.clone());
    }
    return response;
  }catch(e){
    return (
      await caches.match(INDEX) ||
      await caches.match("./") ||
      Response.error()
    );
  }
}

async function cacheThenNetwork(request){
  const cached = await caches.match(request);
  if(cached) return cached;

  try{
    const response = await fetch(request,{cache:"no-cache"});
    if(response && response.ok && new URL(request.url).origin === self.location.origin){
      const cache = await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }catch(e){
    return Response.error();
  }
}

self.addEventListener("fetch",event=>{
  const request = event.request;
  if(request.method !== "GET") return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  // ページ遷移・index.htmlは必ずネットワーク優先。
  if(request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/shisen-sho/")){
    event.respondWith(networkFirstPage(request));
    return;
  }

  // その他の静的ファイルはキャッシュ優先。V18インストール時に最新版へ更新済み。
  event.respondWith(cacheThenNetwork(request));
});
