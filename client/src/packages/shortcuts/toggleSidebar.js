export const toggleSidebar = (event, setShowSidebar) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "s") {
    event.preventDefault();
    setShowSidebar((prev) => !prev);
  }
};
