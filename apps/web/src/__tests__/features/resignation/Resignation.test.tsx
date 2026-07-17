import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Resignation from "@web/features/resignation/Resignation";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/resignation/ViewResignations", () => ({
  default: () => <div>Stub ViewResignations</div>,
}));
vi.mock("@web/features/resignation/ExitFeedbackForm", () => ({
  default: () => <div>Stub ExitFeedbackForm</div>,
}));
vi.mock("@web/features/resignation/Insights", () => ({
  default: () => <div>Stub Insights</div>,
}));

function renderWith(user: any) {
  return render(
    <MemoryRouter initialEntries={["/resignation-process"]}>
      <UserContext.Provider value={{ user } as any}>
        <Resignation />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("Resignation", () => {
  it("hides the Insights tab for a regular employee", () => {
    renderWith({ isSuperUser: false, tenantRole: "employee" });
    expect(
      screen.getByRole("tab", { name: "View Resignations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Exit Feedback" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Insights" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Insights tab for HR/above", () => {
    renderWith({ isSuperUser: true });
    expect(screen.getByRole("tab", { name: "Insights" })).toBeInTheDocument();
  });
});
