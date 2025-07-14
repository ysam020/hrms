import React from "react";
import { toggleSpotlightModal } from "../utils/keyboard-shortcuts/toggleSpotlightModal";

function useSpotlightModal(user) {
  const [open, setOpen] = React.useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  React.useEffect(() => {
    window.addEventListener("keydown", (e) =>
      toggleSpotlightModal(e, user, handleOpen)
    );

    return () => {
      window.removeEventListener("keydown", (e) =>
        toggleSpotlightModal(e, user, handleOpen)
      );
    };
  }, [user]);
  return { open, handleOpen, handleClose };
}

export default useSpotlightModal;
