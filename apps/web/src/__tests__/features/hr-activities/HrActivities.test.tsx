import { render, screen } from "@testing-library/react";
import HrActivities from "@web/features/hr-activities/HrActivities";

vi.mock("@web/features/hr-activities/ViewHrActivities", () => ({
  default: () => <div>Stub ViewHrActivities</div>,
}));

describe("HrActivities", () => {
  it("renders the activities list", () => {
    render(<HrActivities />);
    expect(screen.getByText("Stub ViewHrActivities")).toBeInTheDocument();
  });
});
