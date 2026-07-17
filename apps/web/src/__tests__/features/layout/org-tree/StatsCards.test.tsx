import { render, screen } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import PersonIcon from "@mui/icons-material/Person";
import {
  StatsCards,
  type StatCard,
} from "@web/features/layout/org-tree/StatsCards";

const theme = createTheme();

function makeStats(overrides: Partial<StatCard> = {}): StatCard[] {
  return [
    {
      label: "Total Employees",
      value: 42,
      icon: <PersonIcon />,
      color: theme.palette.primary.main,
      breakdown: [
        { label: "Active", value: 40, color: theme.palette.success.main },
        { label: "Resigned", value: 2, color: theme.palette.warning.main },
      ],
      ...overrides,
    },
  ];
}

describe("StatsCards", () => {
  it("shows each stat's label and value", () => {
    render(<StatsCards stats={makeStats()} loading={false} theme={theme} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Total Employees")).toBeInTheDocument();
  });

  it("shows a placeholder dash instead of the value while loading", () => {
    render(<StatsCards stats={makeStats()} loading={true} theme={theme} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("shows the breakdown items only when present and not loading", () => {
    const { rerender } = render(
      <StatsCards stats={makeStats()} loading={false} theme={theme} />,
    );
    expect(screen.getByText(/40 Active/)).toBeInTheDocument();
    expect(screen.getByText(/2 Resigned/)).toBeInTheDocument();

    rerender(<StatsCards stats={makeStats()} loading={true} theme={theme} />);
    expect(screen.queryByText(/40 Active/)).not.toBeInTheDocument();
  });

  it("omits the breakdown section when a stat has none", () => {
    render(
      <StatsCards
        stats={makeStats({ label: "Teams", value: 5, breakdown: undefined })}
        loading={false}
        theme={theme}
      />,
    );
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.queryByText(/Active/)).not.toBeInTheDocument();
  });
});
