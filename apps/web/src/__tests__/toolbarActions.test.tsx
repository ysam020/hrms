import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button, ToolbarActionsContext } from "@next/ui";

// Page puts its actions in ToolbarActionsContext on compact widths: buttons
// with an icon show only the icon, named and tooltipped by their text.

describe("toolbar actions on compact widths", () => {
  it("shows only the icon, with the label as name and tooltip", () => {
    render(
      <ToolbarActionsContext.Provider value>
        <Button variant="primary" icon="check">
          Submit KYC
        </Button>
      </ToolbarActionsContext.Provider>,
    );
    const b = screen.getByRole("button", { name: "Submit KYC" });
    expect(b).toHaveAttribute("data-tip", "Submit KYC");
    expect(b).not.toHaveTextContent("Submit KYC");
  });

  it("keeps the text when the button has no icon, or outside the toolbar", () => {
    render(
      <>
        <ToolbarActionsContext.Provider value>
          <Button>Discard</Button>
        </ToolbarActionsContext.Provider>
        <Button icon="check">Save</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Discard" })).toHaveTextContent(
      "Discard",
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveTextContent("Save");
    expect(save).not.toHaveAttribute("data-tip");
  });

  it("a long press on touch shows the label without pressing the button", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <ToolbarActionsContext.Provider value>
        <Button icon="plus" onClick={onClick}>
          Apply for Leave
        </Button>
      </ToolbarActionsContext.Provider>,
    );
    const b = screen.getByRole("button", { name: "Apply for Leave" });
    fireEvent.pointerDown(b, { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(b).toHaveAttribute("data-tip-open", "true");
    fireEvent.pointerUp(b, { pointerType: "touch" });
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    // A normal tap still works.
    fireEvent.pointerDown(b, { pointerType: "touch" });
    fireEvent.pointerUp(b, { pointerType: "touch" });
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
