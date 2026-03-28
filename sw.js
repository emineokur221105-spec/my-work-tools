// === sw.js : Service Worker ===
// 這裡採用「網路優先」策略，確保每次打開 App 都是讀取伺服器最新版程式碼，避免衝突。
self.addEventListener('install', (e) => {
    self.skipWaiting(); // 強制立即啟用新版 Service Worker
});

self.addEventListener('activate', (e) => {
    // 可以在這裡清理舊快取，但我們目前不使用快取
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // 什麼都不做，直接讓網路請求通過，確保資料即時
});