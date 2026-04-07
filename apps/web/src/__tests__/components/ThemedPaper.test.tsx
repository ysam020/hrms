import { render, screen } from "@testing-library/react";
import ThemedPaper from "@web/shared/components/ThemedPaper";

describe("ThemedPaper", () => {
  it("renders children", () => {
    render(<ThemedPaper>Paper Content</ThemedPaper>);
    expect(screen.getByText("Paper Content")).toBeInTheDocument();
  });

  it("renders in light theme by default", () => {
    render(<ThemedPaper>Content</ThemedPaper>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("renders in dark theme without crashing", () => {
    render(<ThemedPaper theme="dark">Dark Content</ThemedPaper>);
    expect(screen.getByText("Dark Content")).toBeInTheDocument();
  });

  it("renders outlined variant without crashing", () => {
    render(<ThemedPaper variant="outlined">Outlined</ThemedPaper>);
    expect(screen.getByText("Outlined")).toBeInTheDocument();
  });

  it("renders gradient variant without crashing", () => {
    render(<ThemedPaper variant="gradient">Gradient</ThemedPaper>);
    expect(screen.getByText("Gradient")).toBeInTheDocument();
  });

  it("renders hover variant without crashing", () => {
    render(<ThemedPaper hover>Hoverable</ThemedPaper>);
    expect(screen.getByText("Hoverable")).toBeInTheDocument();
  });
});
