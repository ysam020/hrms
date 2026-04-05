export const toggleSpotlightModal = (
  event: KeyboardEvent,
  user: unknown,
  handleOpen: () => void,
) => {
  if (event.shiftKey && event.key === " ") {
    event.preventDefault();
    if (user) {
      handleOpen();
    }
  }
};
