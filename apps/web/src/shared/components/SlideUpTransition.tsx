import React from "react";
import Slide from "@mui/material/Slide";
import type { TransitionProps } from "@mui/material/transitions";

/**
 * Slide-up transition for MUI Dialog.
 * Use as: <Dialog slots={{ transition: SlideUpTransition }} transitionDuration={{ enter: 280, exit: 200 }} ...>
 */
const SlideUpTransition = React.forwardRef(function SlideUpTransition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default SlideUpTransition;
