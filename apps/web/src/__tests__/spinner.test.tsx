import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, LoadingScreen, Spinner } from "@next/ui";

describe("Spinner", () => {
  it("is one status named by its label, with the mark hidden", () => {
    const { container } = render(<Spinner label="Loading payslips" />);
    const status = screen.getByRole("status", { name: "Loading payslips" });
    const svg = container.querySelector("svg")!;
    expect(status).toContainElement(svg as unknown as HTMLElement);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("path")).toHaveLength(6); // track + ink
  });

  it("shows the label as text instead of an aria-label when asked", () => {
    render(<Spinner label="Searching…" size="small" showLabel />);
    const status = screen.getByRole("status");
    expect(status).not.toHaveAttribute("aria-label");
    expect(status).toHaveTextContent("Searching…");
  });

  it("sizes the mark from presets or pixels", () => {
    const { container, rerender } = render(<Spinner size="large" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "40");
    rerender(<Spinner size={20} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "20");
  });

  it("joins the shared loop phase so marks on screen move together", () => {
    const { container } = render(<Spinner />);
    const sync = (
      container.querySelector("svg") as SVGElement
    ).style.getPropertyValue("--_sync");
    expect(sync).toMatch(/^-?\d+ms$/);
    expect(Math.abs(parseInt(sync))).toBeLessThan(2400);
  });
});

describe("LoadingScreen", () => {
  it("announces its label as a status", () => {
    render(<LoadingScreen label="Starting Praesto" />);
    expect(screen.getByRole("status")).toHaveTextContent("Starting Praesto");
  });
});

describe("Button busy state", () => {
  it("keeps its label as the name and shows the mark without a second status", async () => {
    let finish!: () => void;
    render(
      <Button
        onClick={() =>
          new Promise<void>((r) => {
            finish = r;
          })
        }
      >
        Approve
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Approve" });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button.querySelector("svg")).toBeNull();
  });
});
