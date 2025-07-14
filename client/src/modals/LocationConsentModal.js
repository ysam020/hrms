import * as React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../utils/modalStyle";

function LocationConsentModal(props) {
  return (
    <div>
      <Modal
        open={props.showConsentModal}
        onClose={() => props.setShowConsentModal(false)}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        disableEscapeKeyDown
        disablePortal
      >
        <Box
          sx={{
            ...style,
            bottom: 0,
            top: 0,
            transform: "translate(-50%,50%)",
          }}
        >
          <h2
            id="modal-modal-title"
            style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              marginBottom: "1rem",
            }}
          >
            Location Access Required
          </h2>
          <p id="modal-modal-description" style={{ fontSize: "1rem" }}>
            To enhance your account security and ensure accurate attendance
            records, we request access to your current location.
          </p>

          <div style={{ margin: "1.2rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <span
                role="img"
                aria-label="lock"
                style={{ marginRight: "0.5rem" }}
              >
                🔐
              </span>
              <span>
                Verify where you're logging in from to detect suspicious
                activity
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <span
                role="img"
                aria-label="location-pin"
                style={{ marginRight: "0.5rem" }}
              >
                📍
              </span>
              <span>
                Record your attendance based on location when applicable
              </span>
            </div>
          </div>

          <div style={{ margin: "1.2rem 0" }}>
            <p style={{ fontSize: "1rem" }}>
              Your location is stored securely as part of your session data and
              is <strong>never shared with any third parties</strong>.
            </p>
          </div>

          <p style={{ fontSize: "1rem", marginBottom: "1rem" }}>
            Please click <strong>“Allow”</strong> when your browser asks for
            location permission.
          </p>

          <p style={{ fontSize: "1rem", marginBottom: "1rem" }}>
            If you deny access, you can still log in, but some features like
            attendance tracking may be limited.
          </p>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(LocationConsentModal);
