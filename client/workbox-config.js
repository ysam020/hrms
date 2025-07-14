module.exports = {
  globDirectory: "build/",
  globPatterns: ["**/*.{js,css,html,json,png,ico,txt}"], // Specify files for precaching
  swSrc: "public/firebase-messaging-sw.js", // Custom service worker
  swDest: "build/sw.js", // Final output location of the service worker
  dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./, // Handle hashed filenames
};
