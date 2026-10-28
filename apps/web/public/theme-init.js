// Runs before first paint (index.html, blocking): apply the saved appearance
// so a reload never flashes the light theme before the app's JS has loaded.
// Mirrors src/shell/appearance.ts — Light by default; "dark" and "system"
// (follow the OS) are explicit choices stored under px-appearance.
(function () {
  try {
    var root = document.documentElement;
    var choice = localStorage.getItem("px-appearance");
    var dark =
      choice === "dark" ||
      (choice === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (choice === "dark" || choice === "light")
      root.setAttribute("data-appearance", choice);
    else if (choice !== "system") root.setAttribute("data-appearance", "light");
    // Status bar: iOS reads the style when the installed app launches;
    // "black" is a dark bar with a light clock, "default" a light one.
    // Colours are --px-bg-window's (src/design/tokens.css).
    var meta = function (name, value) {
      var el = document.querySelector('meta[name="' + name + '"]');
      if (el) el.setAttribute("content", value);
    };
    meta("theme-color", dark ? "#141416" : "#f2f3f5");
    meta("apple-mobile-web-app-status-bar-style", dark ? "black" : "default");
    if (dark) {
      root.classList.add("dark-theme");
      root.style.backgroundColor = "#141416";
      root.style.colorScheme = "dark";
    }
  } catch (e) {}
})();
