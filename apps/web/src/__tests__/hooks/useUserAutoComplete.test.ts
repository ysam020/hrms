import { renderHook, act } from "@testing-library/react";
import useUserAutoComplete from "@web/shared/hooks/useUserAutocomplete";

// ── Synchronous debounce so filtering is testable immediately ────────────────

vi.mock("lodash/debounce", () => ({
  default: (fn: Function) => {
    const immediate = (...args: any[]) => fn(...args);
    immediate.cancel = vi.fn();
    return immediate;
  },
}));

// ── Capture the arguments passed to tableToolbarAutoComplete ─────────────────

const mockTableToolbarAutoComplete = vi.fn(() => ({
  renderTopToolbarCustomActions: vi.fn(),
}));

vi.mock("@web/shared/utils/table/tableToolbarAutoComplete", () => ({
  tableToolbarAutoComplete: (...args: any[]) =>
    (mockTableToolbarAutoComplete as (...a: any[]) => any)(...args),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const USERS = ["Alice", "Bob", "Charlie", "alice_admin"];

// Helper: render the hook and return the debouncedSearchUser captured from the
// tableToolbarAutoComplete call (arg index 4).
const setup = () => {
  mockTableToolbarAutoComplete.mockClear();
  const hook = renderHook(() => useUserAutoComplete(USERS));
  // toolbarAutoComplete is called synchronously in useMemo
  const debouncedSearchUser = (
    mockTableToolbarAutoComplete.mock.calls[0] as any[]
  )[4] as ((q: string) => void) & { cancel: () => void };
  return { ...hook, debouncedSearchUser };
};

// ── Initial state ─────────────────────────────────────────────────────────────

describe("useUserAutoComplete – initial state", () => {
  it("starts with empty typedUser", () => {
    const { result } = setup();
    expect(result.current.typedUser).toBe("");
  });

  it("starts with empty selectedUser", () => {
    const { result } = setup();
    expect(result.current.selectedUser).toBe("");
  });

  it("starts with empty filteredUsers", () => {
    const { result } = setup();
    expect(result.current.filteredUsers).toEqual([]);
  });

  it("returns setTypedUser, setSelectedUser, setFilteredUsers functions", () => {
    const { result } = setup();
    expect(typeof result.current.setTypedUser).toBe("function");
    expect(typeof result.current.setSelectedUser).toBe("function");
    expect(typeof result.current.setFilteredUsers).toBe("function");
  });

  it("returns a toolbarActions object with renderTopToolbarCustomActions", () => {
    const { result } = setup();
    expect(result.current.toolbarActions).toBeDefined();
    expect(
      typeof result.current.toolbarActions.renderTopToolbarCustomActions,
    ).toBe("function");
  });
});

// ── State setters ─────────────────────────────────────────────────────────────

describe("useUserAutoComplete – state setters", () => {
  it("setTypedUser updates typedUser state", () => {
    const { result } = setup();
    act(() => result.current.setTypedUser("Alice"));
    expect(result.current.typedUser).toBe("Alice");
  });

  it("setSelectedUser updates selectedUser state", () => {
    const { result } = setup();
    act(() => result.current.setSelectedUser("Bob"));
    expect(result.current.selectedUser).toBe("Bob");
  });

  it("setFilteredUsers updates filteredUsers state directly", () => {
    const { result } = setup();
    act(() => result.current.setFilteredUsers(["Alice", "Bob"]));
    expect(result.current.filteredUsers).toEqual(["Alice", "Bob"]);
  });
});

// ── Filtering (debounce synchronised) ────────────────────────────────────────

describe("useUserAutoComplete – filtering", () => {
  it("filters by case-insensitive substring", () => {
    const { result, debouncedSearchUser } = setup();
    act(() => debouncedSearchUser("ali"));
    expect(result.current.filteredUsers).toContain("Alice");
    expect(result.current.filteredUsers).toContain("alice_admin");
    expect(result.current.filteredUsers).not.toContain("Bob");
  });

  it("returns all users for an empty query", () => {
    const { result, debouncedSearchUser } = setup();
    act(() => debouncedSearchUser(""));
    expect(result.current.filteredUsers).toEqual(USERS);
  });

  it("returns empty array when no match found", () => {
    const { result, debouncedSearchUser } = setup();
    act(() => debouncedSearchUser("zzz"));
    expect(result.current.filteredUsers).toEqual([]);
  });

  it("is case-insensitive for uppercase queries", () => {
    const { result, debouncedSearchUser } = setup();
    act(() => debouncedSearchUser("BOB"));
    expect(result.current.filteredUsers).toEqual(["Bob"]);
  });

  it("matches partial strings in the middle", () => {
    const { result, debouncedSearchUser } = setup();
    act(() => debouncedSearchUser("arlie"));
    expect(result.current.filteredUsers).toEqual(["Charlie"]);
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

describe("useUserAutoComplete – cleanup", () => {
  it("cancels the debounced function on unmount", () => {
    const { unmount, debouncedSearchUser } = setup();
    unmount();
    expect(debouncedSearchUser.cancel).toHaveBeenCalled();
  });
});
