import React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../../../utils/modalStyle";
import Grid from "@mui/material/Grid2";

function ViewFeedbackModal(props) {
  const {
    username,
    reason,
    overall_job_satisfaction,
    quality_of_communication,
    support_from_manager,
    appreciation_for_work,
    collaboration_within_the_team,
    overall_company_culture,
    suggestions,
  } = props.resignationData || {};

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
              <h3>Exit Feedback of {display(username)}</h3>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <p>Reason: {display(reason)}</p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>
                Overall Job Satisfaction: {display(overall_job_satisfaction)}
              </p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>
                Quality of Communication: {display(quality_of_communication)}
              </p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>Support from Manager: {display(support_from_manager)}</p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>Appreciation for Work: {display(appreciation_for_work)}</p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>
                Collaboration within the Team:{" "}
                {display(collaboration_within_the_team)}
              </p>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <p>Overall Company Culture: {display(overall_company_culture)}</p>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <p>Suggestions: {display(suggestions)}</p>
            </Grid>
          </Grid>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(ViewFeedbackModal);
