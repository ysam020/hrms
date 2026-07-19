(function () {
  try {
    const theme = JSON.parse(localStorage.getItem("theme") || '"light"');
    if (theme === "dark") {
      document.documentElement.classList.add("dark-theme");
      document.documentElement.style.backgroundColor = "#111B21";
    }
  } catch (e) {}
})();
