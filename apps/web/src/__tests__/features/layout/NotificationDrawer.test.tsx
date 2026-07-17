import { render, screen } from "@testing-library/react";
import NotificationDrawer from "@web/features/layout/NotificationDrawer";
import useMediaQuery from "@mui/material/useMediaQuery";

vi.mock("@web/features/dashboard/Notifications", () => ({
  default: () => <div>Stub Notifications</div>,
}));

vi.mock("@mui/material/useMediaQuery");
const mockUseMediaQuery = useMediaQuery as unknown as ReturnType<typeof vi.fn>;

function renderDrawer(open = true) {
  const toggleDrawer = vi.fn(() => vi.fn());
  const { container } = render(
    <NotificationDrawer open={open} toggleDrawer={toggleDrawer} />,
  );
  return { toggleDrawer, container };
}

describe("NotificationDrawer", () => {
  it("renders the Notifications feed when open", () => {
    mockUseMediaQuery.mockReturnValue(false);
    renderDrawer(true);
    expect(screen.getByText("Stub Notifications")).toBeInTheDocument();
  });

  it("sizes the drawer at 90% width on mobile", () => {
    mockUseMediaQuery.mockImplementation((query: any) =>
      String(query).includes("max-width"),
    );
    const { container } = renderDrawer(true);
    const paper = container.querySelector(".MuiDrawer-paper") as HTMLElement;
    expect(paper).toHaveStyle({ width: "90%" });
  });

  it("sizes the drawer at 500px on desktop", () => {
    mockUseMediaQuery.mockReturnValue(false);
    const { container } = renderDrawer(true);
    const paper = container.querySelector(".MuiDrawer-paper") as HTMLElement;
    expect(paper).toHaveStyle({ width: "500px" });
  });
});
