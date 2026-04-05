module.exports = {
  globDirectory: "dist/",
  globPatterns: ["**/*.{js,css,html,json,png,ico,txt}"],
  swSrc: "public/firebase-messaging-sw.js",
  swDest: "dist/sw.js",
  // Vite names hashed assets as: name-XXXXXXXX.js / name-XXXXXXXX.css
  dontCacheBustURLsMatching: /\-[0-9a-zA-Z]{8,}\./,
};
