export const handleNotificationClick = (title, navigate) => {
  switch (title) {
    case "Leave Request":
    case "Resignation":
      navigate("/resignation-process");
      break;
    default:
      break;
  }
};
