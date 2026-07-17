import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Profile from "@web/features/profile/Profile";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: vi.fn() }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/profile/BasicInfo", () => ({
  default: (props: any) => <div>Stub BasicInfo for {props.user?.username}</div>,
}));
vi.mock("@web/features/profile/PushNotifications", () => ({
  default: () => <div>Stub PushNotifications</div>,
}));
vi.mock("@web/features/profile/WebAuthnDevices", () => ({
  default: () => <div>Stub WebAuthnDevices</div>,
}));

function renderProfile(path = "/profile", setUser = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <UserContext.Provider
        value={{ user: { username: "jdoe" }, setUser } as any}
      >
        <Routes>
          <Route path="/profile/*" element={<Profile />} />
        </Routes>
      </UserContext.Provider>
    </MemoryRouter>,
  );
  return { setUser };
}

describe("Profile", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiClient.mockReset();
    mockApiClient.mockResolvedValue({ data: { success: false } });
  });

  it("redirects the bare /profile path to the Basic Info tab by default", async () => {
    renderProfile("/profile");
    expect(await screen.findByText(/Stub BasicInfo/)).toBeInTheDocument();
  });

  it("redirects to the last saved tab from localStorage when landing on an unknown sub-path", async () => {
    localStorage.setItem("profile_tab_value", "security-keys");
    renderProfile("/profile/nonexistent-tab");
    expect(await screen.findByText("Stub WebAuthnDevices")).toBeInTheDocument();
  });

  it("shows the tab matching the current URL slug directly", async () => {
    renderProfile("/profile/push-notifications");
    expect(
      await screen.findByText("Stub PushNotifications"),
    ).toBeInTheDocument();
  });

  it("navigates and saves the slug to localStorage when a tab is clicked", async () => {
    renderProfile("/profile/basic-info");
    await screen.findByText(/Stub BasicInfo/);

    fireEvent.click(screen.getByRole("tab", { name: "Security Keys" }));

    expect(await screen.findByText("Stub WebAuthnDevices")).toBeInTheDocument();
    expect(localStorage.getItem("profile_tab_value")).toBe("security-keys");
  });

  it("fetches the full profile on mount and merges it into the user context", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        success: true,
        data: { user: { username: "jdoe", email: "jdoe@example.com" } },
      },
    });
    const { setUser } = renderProfile("/profile/basic-info");
    await waitFor(() => expect(setUser).toHaveBeenCalled());

    const updater = setUser.mock.calls[0][0];
    expect(updater({ username: "jdoe" })).toEqual({
      username: "jdoe",
      email: "jdoe@example.com",
    });
  });
});
