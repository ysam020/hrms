export const toggleSpotlightModal = (event, user, handleOpen) => {
  if (event.shiftKey && event.key === " ") {
    event.preventDefault();
    // Open the modal only if the user is logged in
    if (user) {
      handleOpen();
    }
  }
};
