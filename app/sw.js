const CACHE = 'vodicak-b-v6';
const SHELL = [
    './',
    'index.html',
    'styles.css',
    'manifest.webmanifest',
    'icon.svg',
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'fonts/jakarta-latin.woff2',
    'fonts/jakarta-latin-ext.woff2',
    'js/main.js',
    'js/data.js',
    'js/store.js',
    'js/session.js',
    'js/icons.js',
    'data/questions.json',
    'data/custom-tests.json',
];

const cacheImages = async (cache) => {
    const response = await cache.match('data/questions.json');
    const data = await response.json();
    const images = [...new Set(data.questions.filter((q) => q.image).map((q) => `img/${encodeURIComponent(q.image)}`))];
    await Promise.allSettled(images.map((url) => cache.match(url).then((hit) => hit ?? cache.add(url))));
};

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
            .then(() => caches.open(CACHE).then(cacheImages)),
    );
});

const fetchAndCache = (request) =>
    fetch(request, { cache: 'no-cache' }).then((response) => {
        if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
    });

const isImmutableImage = (url) => url.pathname.includes('/img/');

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;
    if (isImmutableImage(url)) {
        event.respondWith(caches.match(event.request).then((hit) => hit ?? fetchAndCache(event.request)));
        return;
    }
    const network = fetchAndCache(event.request);
    event.waitUntil(network.catch(() => undefined));
    event.respondWith(caches.match(event.request).then((hit) => hit ?? network));
});
