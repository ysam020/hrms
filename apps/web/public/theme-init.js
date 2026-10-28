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
    if (dark) {
      root.classList.add("dark-theme");
      root.style.backgroundColor = "#141416";
      root.style.colorScheme = "dark";
    }
  } catch (e) {}
})();
