import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PerformanceReview from "@web/features/performance-review/PerformanceReview";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/performance-review/PerformanceReviewCycles", () => ({
  default: () => <div>Stub PerformanceReviewCycles</div>,
}));
vi.mock("@web/features/performance-review/Reviews", () => ({
  default: () => <div>Stub Reviews</div>,
}));

function renderWith(user: any) {
  return render(
    <MemoryRouter initialEntries={["/performance-reviews"]}>
      <UserContext.Provider value={{ user } as any}>
        <PerformanceReview />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("PerformanceReview", () => {
  it("shows only the Reviews tab for a regular employee", () => {
    renderWith({ isSuperUser: false, tenantRole: "employee", permissions: [] });
    expect(screen.getByRole("tab", { name: "Reviews" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Review Cycles" }),
    ).not.toBeInTheDocument();
  });

  it("shows both Review Cycles and Reviews tabs for HR/above", () => {
    renderWith({ isSuperUser: true });
    expect(
      screen.getByRole("tab", { name: "Review Cycles" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reviews" })).toBeInTheDocument();
  });
});
