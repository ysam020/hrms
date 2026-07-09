export const handleNotificationClick = (title, navigate) => {
  switch (title) {
    case "Leave Request":
    case "Resignation":
      navigate("/resignation-process");
      break;
    case "Leave":
      navigate("/attendance/view-leave-applications");
      break;
    default:
      break;
  }
};
