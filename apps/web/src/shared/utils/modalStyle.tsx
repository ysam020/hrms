/**
 * Shared modal style for CustomModal callers.
 *
 * Position/centering is handled by CustomModal's flex container — do NOT
 * include position, top, left, or transform here, as they conflict with the
 * framer-motion animation and the flexbox centering approach.
 */
export const style = {
  width: 700,
  maxHeight: "95%",
  overflow: "auto",
  bgcolor: "background.paper",
  boxShadow: 24,
  borderRadius: 5,
  outline: 0,
  p: 4,
};
