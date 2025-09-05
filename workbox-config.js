module.exports = {
  // 1. Where to look for your built files
  globDirectory: "dist/",

  // 2. Which files to cache
  globPatterns: ["**/*.{html,js,css,png,ico}"],

  // 3. Where to save the generated service worker
  swDest: "dist/sw.js",

  // 4. Tell Workbox to take control of the page as soon as it's activated
  clientsClaim: true,
  skipWaiting: true,
};
