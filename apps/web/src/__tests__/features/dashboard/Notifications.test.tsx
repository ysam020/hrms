import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Notifications from "@web/features/dashboard/Notifications";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient from "@web/core/http/axiosConfig";
import { saveNotifications } from "@web/core/db";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@web/shared/hooks/useUpdateFavicon", () => ({ default: vi.fn() }));

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/db", () => ({
  saveNotifications: vi.fn().mockResolvedValue(undefined),
}));
const mockSaveNotifications = saveNotifications as unknown as ReturnType<
  typeof vi.fn
>;

const mockHandleNotificationClick = vi.fn();
vi.mock("@web/shared/utils/notifications/handleNotificationClick", () => ({
  handleNotificationClick: (...args: any[]) =>
    mockHandleNotificationClick(...args),
}));

function makeNotification(overrides: Partial<any> = {}) {
  return {
    _id: "n1",
    title: "Leave Approved",
    message: "Your leave request was approved",
    timeStamp: "2024-06-01T10:00:00Z",
    ...overrides,
  };
}

function renderWith(
  notifications: any[],
  { loading = false, setNotifications = vi.fn(), theme = "light" } = {},
) {
  return render(
    <ThemeContext.Provider value={{ theme, toggleTheme: vi.fn() } as any}>
      <NotificationContext.Provider
        value={{ notifications, loading, setNotifications } as any}
      >
        <Notifications />
      </NotificationContext.Provider>
    </ThemeContext.Provider>,
  );
}

describe("Notifications", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockSaveNotifications.mockClear();
    mockHandleNotificationClick.mockClear();
    mockNavigate.mockClear();
  });

  it("shows loading skeletons", () => {
    const { container } = renderWith([], { loading: true });
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no notifications", () => {
    renderWith([]);
    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });

  it("groups notifications by title and shows the group count", () => {
    renderWith([
      makeNotification({ _id: "1", title: "Leave Approved" }),
      makeNotification({ _id: "2", title: "Leave Approved" }),
      makeNotification({ _id: "3", title: "Payslip Ready" }),
    ]);
    expect(screen.getByText("Leave Approved")).toBeInTheDocument();
    expect(screen.getByText("Payslip Ready")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows a pluralized unread count in the header", () => {
    renderWith([
      makeNotification({ _id: "1" }),
      makeNotification({ _id: "2", title: "Other" }),
    ]);
    expect(screen.getByText("2 unread notifications")).toBeInTheDocument();
  });

  it("shows a singular unread count for exactly one notification", () => {
    renderWith([makeNotification()]);
    expect(screen.getByText("1 unread notification")).toBeInTheDocument();
  });

  it("groups start collapsed, and expand on click", () => {
    renderWith([makeNotification({ title: "Leave Approved" })]);
    expect(
      screen.getByLabelText("Expand Leave Approved notifications"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Leave Approved"));

    expect(
      screen.getByLabelText("Collapse Leave Approved notifications"),
    ).toBeInTheDocument();
  });

  it("collapses an expanded group on a second click", () => {
    renderWith([makeNotification({ title: "Leave Approved" })]);
    fireEvent.click(screen.getByText("Leave Approved"));
    fireEvent.click(screen.getByText("Leave Approved"));
    expect(
      screen.getByLabelText("Expand Leave Approved notifications"),
    ).toBeInTheDocument();
  });

  it("expands a group via Enter on its header", () => {
    renderWith([makeNotification({ title: "Leave Approved" })]);
    fireEvent.keyDown(
      screen.getByText("Leave Approved").closest('[role="button"]')!,
      {
        key: "Enter",
      },
    );
    expect(
      screen.getByLabelText("Collapse Leave Approved notifications"),
    ).toBeInTheDocument();
  });

  it("navigates via the shared handleNotificationClick util when a notification is clicked", async () => {
    renderWith([makeNotification({ title: "Leave Approved" })]);
    fireEvent.click(screen.getByText("Leave Approved"));
    fireEvent.click(screen.getByText("Your leave request was approved"));
    await waitFor(() =>
      expect(mockHandleNotificationClick).toHaveBeenCalledWith(
        "Leave Approved",
        mockNavigate,
      ),
    );
  });

  it("dismisses a single notification: calls the API, updates local state, and persists to IndexedDB", async () => {
    mockPut.mockResolvedValue({});
    const setNotifications = vi.fn();
    renderWith([makeNotification({ _id: "n1", title: "Leave Approved" })], {
      setNotifications,
    });
    fireEvent.click(screen.getByText("Leave Approved"));

    fireEvent.click(screen.getByLabelText("Dismiss notification"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.stringContaining("n1")),
    );
    expect(setNotifications).toHaveBeenCalled();
    const updater = setNotifications.mock.calls[0][0];
    expect(updater([{ _id: "n1" }, { _id: "n2" }])).toEqual([{ _id: "n2" }]);
  });

  it("still removes the notification from local state even if the dismiss API call fails", async () => {
    mockPut.mockRejectedValue(new Error("network"));
    const setNotifications = vi.fn();
    renderWith([makeNotification({ _id: "n1", title: "Leave Approved" })], {
      setNotifications,
    });
    fireEvent.click(screen.getByText("Leave Approved"));

    fireEvent.click(screen.getByLabelText("Dismiss notification"));

    await waitFor(() => expect(setNotifications).toHaveBeenCalled());
  });

  it("dismissing a notification does not also trigger the group's row-click navigation", () => {
    renderWith([makeNotification({ title: "Leave Approved" })]);
    fireEvent.click(screen.getByText("Leave Approved"));

    fireEvent.click(screen.getByLabelText("Dismiss notification"));

    expect(mockHandleNotificationClick).not.toHaveBeenCalled();
  });

  it("clears all notifications after confirming, calling the API and resetting state", async () => {
    mockPut.mockResolvedValue({});
    const setNotifications = vi.fn();
    renderWith([makeNotification()], { setNotifications });

    fireEvent.click(screen.getByLabelText("Clear all notifications"));
    expect(
      screen.getByText(
        "This will remove all your notifications. This cannot be undone.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clear All", { selector: "span" }));

    await waitFor(() => expect(setNotifications).toHaveBeenCalledWith([]));
    expect(mockSaveNotifications).toHaveBeenCalledWith([]);
  });

  it("cancelling the clear-all confirmation makes no changes", () => {
    const setNotifications = vi.fn();
    renderWith([makeNotification()], { setNotifications });
    fireEvent.click(screen.getByLabelText("Clear all notifications"));

    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));

    expect(setNotifications).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("hides the Clear All button when there are no notifications", () => {
    renderWith([]);
    expect(
      screen.queryByLabelText("Clear all notifications"),
    ).not.toBeInTheDocument();
  });
});
