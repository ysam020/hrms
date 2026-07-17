import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import JobOpenings from "@web/features/job-openings/JobOpenings";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/job-openings/ViewJobOpenings", () => ({
  default: () => <div>Stub ViewJobOpenings</div>,
}));
vi.mock("@web/features/job-openings/Insights", () => ({
  default: () => <div>Stub Insights</div>,
}));

function renderWith(user: any) {
  return render(
    <MemoryRouter initialEntries={["/job-openings"]}>
      <UserContext.Provider value={{ user } as any}>
        <JobOpenings />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("JobOpenings", () => {
  it("hides the Insights tab for a regular employee", () => {
    renderWith({ tenantRole: "employee" });
    expect(
      screen.getByRole("tab", { name: "View Job Openings" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Insights" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Insights tab for HR and above", () => {
    renderWith({ tenantRole: "hr" });
    expect(screen.getByRole("tab", { name: "Insights" })).toBeInTheDocument();
  });
});
