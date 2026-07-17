import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DrawerComponent from "@web/features/layout/DrawerComponent";

vi.mock("@web/features/layout/Sidebar", () => ({
  default: (props: any) => (
    <div>Stub Sidebar {props.isMobile ? "(mobile)" : "(desktop)"}</div>
  ),
}));

function renderWith(mobileOpen: boolean, setMobileOpen = vi.fn()) {
  return render(
    <MemoryRouter>
      <DrawerComponent mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
    </MemoryRouter>,
  );
}

describe("DrawerComponent", () => {
  it("renders both a mobile and a desktop Sidebar", async () => {
    renderWith(true);
    expect(
      await screen.findByText("Stub Sidebar (mobile)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Stub Sidebar (desktop)")).toBeInTheDocument();
  });

  it("hides the mobile Sidebar content when mobileOpen is false", async () => {
    renderWith(false);
    // The desktop (permanent) Sidebar is always rendered...
    expect(
      await screen.findByText("Stub Sidebar (desktop)"),
    ).toBeInTheDocument();
    // ...but the temporary mobile drawer's content is unmounted when closed
    // (ModalProps.keepMounted is false).
    expect(screen.queryByText("Stub Sidebar (mobile)")).not.toBeInTheDocument();
  });
});
