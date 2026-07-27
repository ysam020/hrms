import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Sidebar from "@web/features/layout/Sidebar";
import { UserContext } from "@web/app/providers/UserContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderAt(
  path: string,
  {
    user = { fullName: "Jane Doe" },
    totalUnread = 0,
    pendingApprovalsCount = 0,
    isMobile = false,
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <UserContext.Provider value={{ user } as any}>
        <ChatUnreadContext.Provider
          value={{ totalUnread, clearRoomUnread: vi.fn() }}
        >
          <ApprovalsBadgeContext.Provider
            value={
              { pendingApprovalsCount, refetchPendingApprovals: vi.fn() } as any
            }
          >
            <Sidebar isMobile={isMobile} />
          </ApprovalsBadgeContext.Provider>
        </ChatUnreadContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("renders the always-visible nav items", () => {
    renderAt("/", {
      user: { fullName: "Jane Doe", isSuperUser: false, permissions: [] },
    });
    expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Calendar")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat")).toBeInTheDocument();
    expect(screen.getByLabelText("Policy")).toBeInTheDocument();
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
  });

  it("hides Permissions/Analytics/Settings for a regular employee", () => {
    renderAt("/", {
      user: { fullName: "Jane Doe", tenantRole: "employee", permissions: [] },
    });
    expect(screen.queryByLabelText("Permissions")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Analytics")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
  });

  it("shows Permissions/Analytics/Settings for a superuser", () => {
    renderAt("/", { user: { fullName: "Jane Doe", isSuperUser: true } });
    expect(screen.getByLabelText("Permissions")).toBeInTheDocument();
    expect(screen.getByLabelText("Analytics")).toBeInTheDocument();
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("navigates to the clicked item's path", () => {
    renderAt("/", { user: { fullName: "Jane Doe", isSuperUser: true } });
    fireEvent.click(screen.getByLabelText("Calendar"));
    expect(mockNavigate).toHaveBeenCalledWith("/calendar");
  });

  it("navigates to the profile page when the avatar is clicked", () => {
    renderAt("/", { user: { fullName: "Jane Doe", isSuperUser: true } });
    fireEvent.click(screen.getByLabelText("View Jane Doe's profile"));
    expect(mockNavigate).toHaveBeenCalledWith("/profile");
  });

  it("uses a generic profile label when the user has no name yet", () => {
    renderAt("/", { user: { fullName: undefined, isSuperUser: true } });
    expect(screen.getByLabelText("View your profile")).toBeInTheDocument();
  });

  it("marks Settings active for a legacy settings-alias route", () => {
    render(
      <MemoryRouter initialEntries={["/subscription"]}>
        <UserContext.Provider
          value={{ user: { fullName: "Jane Doe", isSuperUser: true } } as any}
        >
          <ChatUnreadContext.Provider
            value={{ totalUnread: 0, clearRoomUnread: vi.fn() }}
          >
            <ApprovalsBadgeContext.Provider
              value={
                {
                  pendingApprovalsCount: 0,
                  refetchPendingApprovals: vi.fn(),
                } as any
              }
            >
              <Sidebar />
            </ApprovalsBadgeContext.Provider>
          </ChatUnreadContext.Provider>
        </UserContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Settings").className).toContain("active");
  });

  it("shows a badge count for Chat and Pending Approvals when there is unread/pending activity", async () => {
    renderAt("/", {
      user: { fullName: "Jane Doe", isSuperUser: true },
      totalUnread: 3,
      pendingApprovalsCount: 5,
    });
    // Every nav icon (including Chat's) is React.lazy + Suspense-wrapped —
    // under a full parallel test-suite run, the dynamic import can take
    // longer than findByText's default 1s timeout to resolve even though it
    // reliably resolves in well under that when this file runs alone.
    expect(
      await screen.findByText("3", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("5", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("shows the item's label as text only in mobile mode", () => {
    renderAt("/", {
      user: { fullName: "Jane Doe", isSuperUser: true },
      isMobile: true,
    });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
