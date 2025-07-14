export const navigateWithKeyboard = (event, navigate) => {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const ctrlShiftLeftArrow =
    event.ctrlKey && event.shiftKey && event.key === "ArrowLeft" && !isMac;
  const cmdShiftLeftArrow =
    event.metaKey && event.shiftKey && event.key === "ArrowLeft" && isMac;
  const ctrlShiftRightArrow =
    event.ctrlKey && event.shiftKey && event.key === "ArrowRight" && !isMac;
  const cmdShiftRightArrow =
    event.metaKey && event.shiftKey && event.key === "ArrowRight" && isMac;

  if (ctrlShiftLeftArrow || cmdShiftLeftArrow) {
    navigate(-1);
  } else if (ctrlShiftRightArrow || cmdShiftRightArrow) {
    navigate(1);
  }
};
