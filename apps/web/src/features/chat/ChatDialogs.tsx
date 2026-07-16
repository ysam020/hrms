import { Suspense } from "react";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@web/shared/components/Button";
import { CloseIcon } from "./chatIcons";

export function ImageLightboxDialog({
  lightboxUrl,
  onClose,
}: {
  lightboxUrl: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(lightboxUrl)}
      onClose={onClose}
      maxWidth="lg"
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
    >
      <DialogContent sx={{ p: 0, bgcolor: "black", position: "relative" }}>
        <IconButton
          onClick={onClose}
          aria-label="Close image preview"
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "white",
            zIndex: 1,
          }}
        >
          <Suspense fallback={null}>
            <CloseIcon aria-hidden="true" />
          </Suspense>
        </IconButton>
        {lightboxUrl && (
          <img
            src={lightboxUrl}
            alt="Preview"
            style={{ maxWidth: "90vw", maxHeight: "85vh", display: "block" }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteMessageDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
    >
      <DialogTitle>Delete Message</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This message will be deleted for everyone. This cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="danger">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function DeleteConversationDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
    >
      <DialogTitle>Delete Chat</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This conversation will be removed from your list. The other
          participant will still have access to it.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="danger">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
