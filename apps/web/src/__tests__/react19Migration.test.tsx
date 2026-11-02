import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import { UserContext } from "@web/app/providers/UserContext";
import { RequireSession } from "@next/app/session";
import { inertProps } from "@next/motion/Presence";

// Regressions found while moving to React 19.3 (see
// docs/react-19-migration/FUNCTIONAL_REGRESSION_REPORT.md).

describe("inert under React 19", () => {
  it("renders the attribute (React 19 drops the empty string React 18 needed)", () => {
    render(<div data-testid="leaving" {...inertProps(true)} />);
    expect(screen.getByTestId("leaving")).toHaveAttribute("inert");
    expect(screen.getByTestId("leaving")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("omits it when the element is present", () => {
    render(<div data-testid="present" {...inertProps(false)} />);
    expect(screen.getByTestId("present")).not.toHaveAttribute("inert");
  });
});

describe("useServerPagination", () => {
  it("ignores a slower, superseded response", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    const fetcher = vi.fn(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const { result, rerender } = renderHook(
      ({ dep }) => useServerPagination(fetcher, { deps: [dep] }),
      { initialProps: { dep: "Pending" } },
    );
    rerender({ dep: "Approved" });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    // The newer request (Approved) answers first, then the old one.
    await act(async () => resolvers[1]!({ data: ["approved"], totalCount: 1 }));
    await act(async () => resolvers[0]!({ data: ["pending"], totalCount: 1 }));
    expect(result.current.data).toEqual(["approved"]);
    expect(result.current.loading).toBe(false);
  });
});

describe("RequireSession return path", () => {
  function LoginProbe() {
    const location = useLocation();
    const from = (location.state as { from?: { pathname: string } } | null)
      ?.from;
    return <p>login from={from?.pathname ?? "none"}</p>;
  }
  const renderAt = (endedByUser: boolean) =>
    render(
      <UserContext.Provider
        value={{
          user: null,
          setUser: () => {},
          handleLogout: () => {},
          endedByUser,
        }}
      >
        <MemoryRouter initialEntries={["/attendance/view-leave-applications"]}>
          <Routes>
            <Route path="/login" element={<LoginProbe />} />
            <Route
              path="*"
              element={
                <RequireSession>
                  <p>secret</p>
                </RequireSession>
              }
            />
          </Routes>
        </MemoryRouter>
      </UserContext.Provider>,
    );

  it("keeps the page to return to when the session expired", () => {
    renderAt(false);
    expect(
      screen.getByText("login from=/attendance/view-leave-applications"),
    ).toBeInTheDocument();
  });

  it("drops it after a deliberate sign-out, so the next person starts fresh", () => {
    renderAt(true);
    expect(screen.getByText("login from=none")).toBeInTheDocument();
  });
});

describe("root error reporting", () => {
  it("redacts tokens, emails, ID numbers and query values", async () => {
    const { redact } = await import("@next/app/errorReporting");
    const out = redact(
      "GET /x?access_token=abc.def&page=2 Bearer eyJhbGc.eyJzdWIi.sig failed for maya@halcyon.example (PAN ABCDE1234F, 1234 5678 9012)",
    );
    expect(out).not.toMatch(/abc\.def|eyJ|maya@|ABCDE1234F|1234 5678 9012/);
    expect(out).toContain("page=2");
  });

  it("sends one report per error with the path only", async () => {
    const { createErrorHandlers } = await import("@next/app/errorReporting");
    const sink = vi.fn();
    createErrorHandlers(sink).onCaughtError(
      new Error("Failed for neha@halcyon.example"),
      {
        componentStack: "\n    at Row",
      },
    );
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![0]).toMatchObject({
      kind: "caught",
      message: "Failed for [email]",
    });
  });
});
