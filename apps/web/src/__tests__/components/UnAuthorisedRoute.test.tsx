import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lottie-react", () => ({
  default: () => <div data-testid="lottie-animation" />,
}));
vi.mock("@web/assets/lottie/not-found.json", () => ({ default: {} }));

import UnAuthorisedRoute from "@web/app/router/UnAuthorisedRoute";

describe("UnAuthorisedRoute", () => {
  it("renders a 'Go Back' button", () => {
    render(<UnAuthorisedRoute />);
    expect(
      screen.getByRole("button", { name: /go back/i }),
    ).toBeInTheDocument();
  });

  it("renders the Lottie animation", () => {
    render(<UnAuthorisedRoute />);
    expect(screen.getByTestId("lottie-animation")).toBeInTheDocument();
  });

  it("calls window.history.back() when button is clicked", async () => {
    const backSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    render(<UnAuthorisedRoute />);

    await userEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(backSpy).toHaveBeenCalledTimes(1);

    backSpy.mockRestore();
  });

  it("does not navigate automatically without user action", () => {
    const backSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    render(<UnAuthorisedRoute />);
    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
