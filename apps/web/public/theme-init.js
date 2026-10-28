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
    // Browser chrome colour: --px-bg-window (src/design/tokens.css). The
    // iOS status-bar style is left alone (see index.html).
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor)
      themeColor.setAttribute("content", dark ? "#141416" : "#f2f3f5");
    if (dark) {
      root.classList.add("dark-theme");
      root.style.backgroundColor = "#141416";
      root.style.colorScheme = "dark";
    }
  } catch (e) {}
})();
