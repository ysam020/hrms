export const toggleSidebar = (
  event: KeyboardEvent,
  setShowSidebar: (updater: (prev: boolean) => boolean) => void,
) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "s") {
    event.preventDefault();
    setShowSidebar((prev) => !prev);
  }
};
