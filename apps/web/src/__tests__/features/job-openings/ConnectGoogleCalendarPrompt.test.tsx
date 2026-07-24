import { render, screen, fireEvent } from "@testing-library/react";
import ConnectGoogleCalendarPrompt from "@web/features/job-openings/ConnectGoogleCalendarPrompt";

describe("ConnectGoogleCalendarPrompt", () => {
  it("renders nothing meaningful when closed", () => {
    render(
      <ConnectGoogleCalendarPrompt
        open={false}
        onConnect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByText("Connect Google Calendar"),
    ).not.toBeInTheDocument();
  });

  it("shows the explanation and both actions when open", () => {
    render(
      <ConnectGoogleCalendarPrompt
        open={true}
        onConnect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Connect Google Calendar", { selector: "h6" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You need to connect your Google Calendar/),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onConnect when the connect button is clicked", () => {
    const onConnect = vi.fn();
    render(
      <ConnectGoogleCalendarPrompt
        open={true}
        onConnect={onConnect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByText("Connect Google Calendar", { selector: "span" }),
    );
    expect(onConnect).toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <ConnectGoogleCalendarPrompt
        open={true}
        onConnect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
