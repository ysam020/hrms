import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SpotlightModal from "@web/features/layout/modals/SpotlightModal";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderModal(
  { user = { fullName: "Jane Doe", isSuperUser: true }, open = true } = {},
  handleClose = vi.fn(),
) {
  render(
    <MemoryRouter>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <UserContext.Provider value={{ user } as any}>
          <SpotlightModal open={open} handleClose={handleClose} />
        </UserContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
  return { handleClose };
}

describe("SpotlightModal", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => mockNavigate.mockClear());

  it("shows no results state before any search input", () => {
    renderModal();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows matching routes as the user types", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Search routes"), {
      target: { value: "Calendar" },
    });
    expect(
      screen.getByRole("option", { name: /Calendar/ }),
    ).toBeInTheDocument();
  });

  it("shows a 'no results' message for a query with no matches", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Search routes"), {
      target: { value: "zzzznonexistentroute" },
    });
    expect(
      screen.getByText(/No results for "zzzznonexistentroute"/),
    ).toBeInTheDocument();
  });

  it("clears results when the input is emptied", () => {
    renderModal();
    const input = screen.getByLabelText("Search routes");
    fireEvent.change(input, { target: { value: "Calendar" } });
    expect(screen.queryByRole("option")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("hides an access-gated route from results for a user without access", () => {
    renderModal({
      user: {
        fullName: "Employee",
        isSuperUser: false,
        tenantRole: "employee",
      },
    });
    fireEvent.change(screen.getByLabelText("Search routes"), {
      target: { value: "Analytics" },
    });
    expect(
      screen.queryByRole("option", { name: /^Analytics/ }),
    ).not.toBeInTheDocument();
  });

  it("shows an access-gated route for a user who has access", () => {
    renderModal({
      user: { fullName: "Owner", isSuperUser: false, tenantRole: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Search routes"), {
      target: { value: "Analytics" },
    });
    expect(
      screen.getByRole("option", { name: /^Analytics/ }),
    ).toBeInTheDocument();
  });

  it("navigates and closes the modal when a suggestion is clicked", () => {
    const { handleClose } = renderModal();
    fireEvent.change(screen.getByLabelText("Search routes"), {
      target: { value: "Calendar" },
    });
    fireEvent.click(screen.getByRole("option", { name: /Calendar/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/calendar");
    expect(handleClose).toHaveBeenCalled();
  });

  it("navigates the highlighted result via ArrowDown then Enter", () => {
    const { handleClose } = renderModal();
    const input = screen.getByLabelText("Search routes");
    fireEvent.change(input, { target: { value: "Employee Management" } });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    const secondOptionPath = within(options[1]).getByText(/^\//).textContent;

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith(secondOptionPath);
    expect(handleClose).toHaveBeenCalled();
  });

  it("closes the modal on Escape", () => {
    const { handleClose } = renderModal();
    fireEvent.keyDown(screen.getByLabelText("Search routes"), {
      key: "Escape",
    });
    expect(handleClose).toHaveBeenCalled();
  });
});
