import * as React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../utils/modalStyle";
import { ThemeContext } from "../contexts/ThemeContext";

function BroadcastModal(props) {
  const { theme } = React.useContext(ThemeContext);
  return (
    <Modal
      id={theme}
      open={props.open}
      onClose={props.handleClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
      disableEscapeKeyDown
    >
      <Box sx={style}>
        <h4 style={{ margin: 0 }}>
          Paymaster is open in another window. Click Use Here to open in this
          window
        </h4>
        <br />

        <div className="flex-div">
          <button
            className="btn"
            onClick={() =>
              (window.location.href = "https://cms.sameer-yadav.site")
            }
          >
            Close
          </button>
          <button
            className="btn"
            onClick={props.handleUseInThisTab}
            style={{ marginLeft: "10px" }}
          >
            Use here
          </button>
        </div>
      </Box>
    </Modal>
  );
}

export default React.memo(BroadcastModal);
