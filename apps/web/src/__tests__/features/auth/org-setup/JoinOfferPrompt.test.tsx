import { render, screen, fireEvent } from "@testing-library/react";
import { JoinOfferPrompt } from "@web/features/auth/org-setup/JoinOfferPrompt";

describe("JoinOfferPrompt", () => {
  it("shows the tenant name and a request-to-join button", () => {
    render(
      <JoinOfferPrompt
        tenantName="Acme Corp"
        previousRejected={false}
        submitting={false}
        onRequestJoin={vi.fn()}
      />,
    );
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(
      screen.queryByText(/previous request was declined/),
    ).not.toBeInTheDocument();
  });

  it("shows a declined-notice when a previous request was rejected", () => {
    render(
      <JoinOfferPrompt
        tenantName="Acme Corp"
        previousRejected={true}
        submitting={false}
        onRequestJoin={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Your previous request was declined."),
    ).toBeInTheDocument();
  });

  it("disables the button while submitting and calls onRequestJoin otherwise", () => {
    const onRequestJoin = vi.fn();
    const { rerender } = render(
      <JoinOfferPrompt
        tenantName="Acme Corp"
        previousRejected={false}
        submitting={true}
        onRequestJoin={onRequestJoin}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Request to join" }),
    ).toBeDisabled();

    rerender(
      <JoinOfferPrompt
        tenantName="Acme Corp"
        previousRejected={false}
        submitting={false}
        onRequestJoin={onRequestJoin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Request to join" }));
    expect(onRequestJoin).toHaveBeenCalled();
  });
});
