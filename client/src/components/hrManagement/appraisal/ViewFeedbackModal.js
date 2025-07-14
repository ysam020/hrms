import React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../../../utils/modalStyle";
import Grid from "@mui/material/Grid2";

function ViewFeedbackModal(props) {
  const { username, manager_strengths, manager_AreasOfImprovement, feedback } =
    props.appraisalData || {};

  const display = (value) => value || "NA";

  return (
    <div>
      <Modal
        open={props.open}
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        disablePortal
      >
        <Box sx={style}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <h3>Appraisal Feedback of {display(username)}</h3>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <p>Strengths: {display(manager_strengths)}</p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>Areas of Improvement: {display(manager_AreasOfImprovement)}</p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>Feedback: {display(feedback)}</p>
            </Grid>
          </Grid>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(ViewFeedbackModal);
