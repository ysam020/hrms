import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { getAccessToken, setAccessToken } from "@web/core/http/axiosConfig";
import { clearStorageOnSignOut } from "@web/shared/utils/signOutStorage";
import { PENDING_FORM_KEY } from "@web/features/auth/org-setup/types";
import { SegmentedControl } from "@next/ui";

// The logout request goes through the app's axios client; tests decide how
// the server answers.
const logoutCall = vi.fn();
vi.mock("@web/core/http/axiosConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@web/core/http/axiosConfig")>();
  return { ...actual, default: (...a: any[]) => logoutCall(...a) };
});

describe("clearStorageOnSignOut", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the appearance choice and a paid-but-unfinished setup, clears the rest", () => {
    localStorage.setItem("px-appearance", "system");
    localStorage.setItem(PENDING_FORM_KEY, '{"orgName":"Halcyon"}');
    localStorage.setItem("some-session-state", "x");
    clearStorageOnSignOut();
    expect(localStorage.getItem("px-appearance")).toBe("system");
    expect(localStorage.getItem(PENDING_FORM_KEY)).toBe(
      '{"orgName":"Halcyon"}',
    );
    expect(localStorage.getItem("some-session-state")).toBeNull();
  });
});

describe("useLogout", () => {
  const setup = async () => {
    const { default: useLogout } = await import("@web/shared/hooks/useLogout");
    const setUser = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/org-setup"]}>
        <Routes>
          <Route path="/org-setup" element={<>{children}</>} />
          <Route path="/login" element={<p>Sign in page</p>} />
        </Routes>
      </MemoryRouter>
    );
    const hook = renderHook(() => useLogout(setUser), { wrapper });
    return { hook, setUser };
  };

  beforeEach(() => {
    localStorage.clear();
    logoutCall.mockReset();
  });

  it.each([
    [
      "the server confirms",
      () => logoutCall.mockResolvedValue({ data: { success: true } }),
    ],
    [
      "the server refuses",
      () => logoutCall.mockResolvedValue({ data: { success: false } }),
    ],
    [
      "the request fails",
      () => logoutCall.mockRejectedValue(new Error("offline")),
    ],
  ])("ends the session in this tab when %s", async (_label, answer) => {
    answer();
    setAccessToken("token");
    localStorage.setItem("px-appearance", "dark");
    localStorage.setItem("session-thing", "x");
    const { hook, setUser } = await setup();
    await act(async () => {
      await hook.result.current.confirmLogout();
    });
    expect(getAccessToken()).toBeNull();
    expect(setUser).toHaveBeenCalledWith(null);
    expect(localStorage.getItem("px-appearance")).toBe("dark");
    expect(localStorage.getItem("session-thing")).toBeNull();
  });
});

describe("SegmentedControl", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });
  const statuses = [
    "All",
    "Draft",
    "Processing",
    "Approved",
    "Disbursed",
    "Cancelled",
  ];

  it("becomes a picker for long filters on a phone, keeping value and label", () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes("max-width: 639px"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as any;
    const onChange = vi.fn();
    render(
      <SegmentedControl
        role="radiogroup"
        label="Status"
        value="Draft"
        onChange={onChange}
        segments={statuses.map((v) => ({ value: v, label: v }))}
      />,
    );
    const picker = screen.getByRole("combobox", { name: "Status" });
    expect(picker).toHaveValue("Draft");
    fireEvent.change(picker, { target: { value: "Approved" } });
    expect(onChange).toHaveBeenCalledWith("Approved");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("keeps its segments on wider screens and for tab sets", () => {
    render(
      <SegmentedControl
        role="radiogroup"
        label="Status"
        value="Draft"
        onChange={() => {}}
        segments={statuses.map((v) => ({ value: v, label: v }))}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Status" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(statuses.length);
  });
});
