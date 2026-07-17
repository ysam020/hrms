import { render, screen, fireEvent } from "@testing-library/react";
import BroadcastModal from "@web/features/layout/modals/BroadcastModal";
import { UserContext } from "@web/app/providers/UserContext";

function renderModal(handleLogout = vi.fn(), handleUseInThisTab = vi.fn()) {
  const handleClose = vi.fn();
  render(
    <UserContext.Provider value={{ handleLogout } as any}>
      <BroadcastModal
        open={true}
        handleClose={handleClose}
        handleUseInThisTab={handleUseInThisTab}
      />
    </UserContext.Provider>,
  );
  return { handleClose, handleLogout, handleUseInThisTab };
}

describe("BroadcastModal", () => {
  it("shows the multi-session warning", () => {
    renderModal();
    expect(screen.getByText("Multiple Sessions Detected")).toBeInTheDocument();
  });

  it("calls handleLogout from context when 'Logout All Sessions' is clicked", () => {
    const { handleLogout } = renderModal();
    fireEvent.click(
      screen.getByText("Logout All Sessions", { selector: "span" }),
    );
    expect(handleLogout).toHaveBeenCalled();
  });

  it("calls handleUseInThisTab when 'Continue Here' is clicked", () => {
    const { handleUseInThisTab } = renderModal();
    fireEvent.click(screen.getByText("Continue Here", { selector: "span" }));
    expect(handleUseInThisTab).toHaveBeenCalled();
  });
});
