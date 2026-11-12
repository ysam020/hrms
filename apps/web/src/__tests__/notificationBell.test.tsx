import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { NotificationContext } from "@web/app/providers/NotificationContext";

// The bell: read and cleared are separate states. Opening a notification
// marks it read and follows its deep link; the badge counts unread ones;
// clearing removes it.

const put = vi.fn();
vi.mock("@next/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@next/lib/api")>();
  return { ...actual, apiClient: { put: (...a: any[]) => put(...a) } };
});

const saveNotification = vi.fn().mockResolvedValue(undefined);
const deleteNotificationsFromDB = vi.fn().mockResolvedValue(undefined);
vi.mock("@web/core/db", () => ({
  saveNotification: (...a: any[]) => saveNotification(...a),
  deleteNotificationsFromDB: (...a: any[]) => deleteNotificationsFromDB(...a),
}));

const note = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  title: `Note ${id}`,
  message: `Body ${id}`,
  isRead: false,
  ...extra,
});

async function renderBell(initial: any[]) {
  const { NotificationsButton } = await import("@next/shell/Notifications");
  const setAlert = vi.fn();
  function Harness() {
    const [notifications, setNotifications] = useState(initial);
    return (
      <AlertContext.Provider value={{ setAlert } as any}>
        <NotificationContext.Provider
          value={{ notifications, setNotifications, loading: false } as any}
        >
          <NotificationsButton />
        </NotificationContext.Provider>
      </AlertContext.Provider>
    );
  }
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<Harness />} />
        <Route path="/approvals" element={<p>Approvals page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { setAlert };
}

const bell = () => screen.getByRole("button", { name: /^Notifications/ });

beforeEach(() => {
  put.mockReset();
  saveNotification.mockClear();
  deleteNotificationsFromDB.mockClear();
});

describe("notification bell", () => {
  it("counts only unread notifications", async () => {
    await renderBell([note("a"), note("b", { isRead: true }), note("c")]);
    expect(bell()).toHaveAccessibleName("Notifications, 2 new");
  });

  it("has no unread count when everything has been read", async () => {
    await renderBell([note("a", { isRead: true })]);
    expect(bell()).toHaveAccessibleName("Notifications");
  });

  it("opening a notification marks it read and follows its link", async () => {
    put.mockResolvedValue({});
    await renderBell([note("a", { link: "/approvals" }), note("b")]);
    fireEvent.click(bell());
    await act(async () => fireEvent.click(screen.getByText("Note a")));

    expect(put).toHaveBeenCalledWith("/read-notification/a");
    expect(await screen.findByText("Approvals page")).toBeInTheDocument();
    // The read state is kept for the offline cache too.
    expect(saveNotification).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "a", isRead: true }),
    );
    // Reading never clears.
    expect(put).not.toHaveBeenCalledWith("/clear-notification/a");
  });

  it("opening a notification without a link marks it read and stays put", async () => {
    put.mockResolvedValue({});
    await renderBell([note("a"), note("b")]);
    fireEvent.click(bell());
    await act(async () => fireEvent.click(screen.getByText("Note a")));
    expect(put).toHaveBeenCalledWith("/read-notification/a");
    expect(bell()).toHaveAccessibleName("Notifications, 1 new");
    expect(screen.getByText("Note a")).toBeInTheDocument();
  });

  it("never navigates to a link that isn't a same-app path", async () => {
    put.mockResolvedValue({});
    await renderBell([note("a", { link: "//evil.example/x" })]);
    fireEvent.click(bell());
    await act(async () => fireEvent.click(screen.getByText("Note a")));
    expect(screen.getByText("Note a")).toBeInTheDocument();
    expect(screen.queryByText("Approvals page")).toBeNull();
  });

  it("opening an already-read notification doesn't call the API again", async () => {
    await renderBell([note("a", { isRead: true, link: "/approvals" })]);
    fireEvent.click(bell());
    await act(async () => fireEvent.click(screen.getByText("Note a")));
    expect(put).not.toHaveBeenCalled();
    expect(await screen.findByText("Approvals page")).toBeInTheDocument();
  });

  it("puts a notification back to unread if the gateway refuses", async () => {
    put.mockRejectedValue(
      Object.assign(new Error("Nope"), {
        isAxiosError: true,
        response: { status: 500, data: { message: "Nope" } },
      }),
    );
    const { setAlert } = await renderBell([note("a"), note("b")]);
    fireEvent.click(bell());
    await act(async () => fireEvent.click(screen.getByText("Note a")));
    await waitFor(() =>
      expect(bell()).toHaveAccessibleName("Notifications, 2 new"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("keeps it read quietly when the gateway has no read route yet (404)", async () => {
    put.mockRejectedValue(
      Object.assign(new Error("Not found"), {
        isAxiosError: true,
        response: { status: 404, data: {} },
      }),
    );
    const { setAlert } = await renderBell([note("a"), note("b")]);
    fireEvent.click(bell());
    await act(async () => fireEvent.click(screen.getByText("Note a")));
    expect(bell()).toHaveAccessibleName("Notifications, 1 new");
    expect(setAlert).not.toHaveBeenCalled();
  });

  it("Mark All Read reads everything and keeps the list", async () => {
    put.mockResolvedValue({});
    await renderBell([note("a"), note("b")]);
    fireEvent.click(bell());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Mark All Read" })),
    );
    expect(put).toHaveBeenCalledWith("/read-all-notifications");
    expect(bell()).toHaveAccessibleName("Notifications");
    expect(screen.getByText("Note a")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark All Read" })).toBeNull();
  });

  it("clearing removes the notification and drops it from the offline cache", async () => {
    put.mockResolvedValue({});
    await renderBell([note("a"), note("b")]);
    fireEvent.click(bell());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Clear “Note a”" })),
    );
    expect(put).toHaveBeenCalledWith("/clear-notification/a");
    await waitFor(() => expect(screen.queryByText("Note a")).toBeNull());
    expect(deleteNotificationsFromDB).toHaveBeenCalledWith(["a"]);
  });
});
