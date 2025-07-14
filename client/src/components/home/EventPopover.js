import React, { useMemo } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import { IconButton, Popover, Box } from "@mui/material";
import apiClient from "../../config/axiosConfig";

function EventPopover(props) {
  const deleteEvent = async (_id) => {
    try {
      await apiClient.delete(`/delete-calendar-event/${_id}`);
      props.setEvents(props.events.filter((event) => event._id !== _id));
      props.getEvents();
      props.handlePopoverClose();
    } catch (err) {
      console.error(err);
    }
  };

  const anchorOrigin = useMemo(
    () => ({
      vertical: "bottom",
      horizontal: "left",
    }),
    []
  );

  const transformOrigin = useMemo(
    () => ({
      vertical: "top",
      horizontal: "left",
    }),
    []
  );

  const popoverContentStyle = useMemo(
    () => ({
      display: "flex",
      alignItems: "center",
    }),
    []
  );

  return (
    <Popover
      open={props.openPopover}
      anchorEl={props.popoverAnchorEl}
      onClose={props.handlePopoverClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
    >
      <Box>
        <div style={popoverContentStyle}>
          <div style={{ flex: 1 }}>
            <strong>{props.selectedEvent?.title}</strong>
            <br />
            <span>
              {props.selectedEvent?.date}, {props.selectedEvent?.startTime}-
              {props.selectedEvent?.endTime}
            </span>
            <br />
            <span>{props.selectedEvent?.description}</span>
          </div>
          <IconButton onClick={() => deleteEvent(props.selectedEvent._id)}>
            <DeleteIcon sx={{ color: "#F15C6D" }} />
          </IconButton>
        </div>
      </Box>
    </Popover>
  );
}

export default React.memo(EventPopover);
