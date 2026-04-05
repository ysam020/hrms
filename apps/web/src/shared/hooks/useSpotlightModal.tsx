import React from "react";
import { toggleSpotlightModal } from "@web/core/shortcuts";

function useSpotlightModal(user) {
  const [open, setOpen] = React.useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  React.useEffect(() => {
    const handler = (e) => toggleSpotlightModal(e, user, handleOpen);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [user]);
  return { open, handleOpen, handleClose };
}

export default useSpotlightModal;
