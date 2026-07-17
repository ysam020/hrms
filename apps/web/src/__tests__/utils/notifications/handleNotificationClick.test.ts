import { handleNotificationClick } from "@web/shared/utils/notifications/handleNotificationClick";

describe("handleNotificationClick", () => {
  it.each(["Leave Request", "Resignation"])(
    "navigates to the resignation process for '%s'",
    (title) => {
      const navigate = vi.fn();
      handleNotificationClick(title, navigate);
      expect(navigate).toHaveBeenCalledWith("/resignation-process");
    },
  );

  it("navigates to the leave applications view for 'Leave'", () => {
    const navigate = vi.fn();
    handleNotificationClick("Leave", navigate);
    expect(navigate).toHaveBeenCalledWith(
      "/attendance/view-leave-applications",
    );
  });

  it("does not navigate for an unrecognized title", () => {
    const navigate = vi.fn();
    handleNotificationClick("Some Other Notification", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });
});
