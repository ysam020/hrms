window.addEventListener("load", () => {
  let offlineIndicator = null;

  function showOfflineIndicator() {
    if (!offlineIndicator) {
      offlineIndicator = document.createElement("div");
      offlineIndicator.className = "offline-indicator";
      offlineIndicator.textContent = "⚠️ No internet connection";
      document.body.appendChild(offlineIndicator);
    }
  }

  function hideOfflineIndicator() {
    if (offlineIndicator) {
      offlineIndicator.remove();
      offlineIndicator = null;
    }
  }

  window.addEventListener("online", hideOfflineIndicator);
  window.addEventListener("offline", showOfflineIndicator);

  if (!navigator.onLine) showOfflineIndicator();
});
