import { render, screen } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { RoleLegend } from "@web/features/layout/org-tree/RoleLegend";

const theme = createTheme();

describe("RoleLegend", () => {
  it("renders a legend chip for each role", () => {
    render(<RoleLegend theme={theme} />);
    expect(screen.getByText("Role Legend")).toBeInTheDocument();
    expect(screen.getByText("CEO")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Team Lead")).toBeInTheDocument();
    expect(screen.getByText("Senior")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
  });
});
