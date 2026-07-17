import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LegalPageLayout from "@web/pages/legal/LegalPageLayout";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("LegalPageLayout", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("shows the title, last-updated date, and children content", () => {
    render(
      <MemoryRouter>
        <LegalPageLayout title="Terms of Use" lastUpdated="1 January 2026">
          <p>Some legal text.</p>
        </LegalPageLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText("Terms of Use")).toBeInTheDocument();
    expect(
      screen.getByText("Last updated: 1 January 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Some legal text.")).toBeInTheDocument();
  });

  it("navigates back when the back button is clicked", () => {
    render(
      <MemoryRouter>
        <LegalPageLayout title="Terms of Use" lastUpdated="1 January 2026">
          <p>Some legal text.</p>
        </LegalPageLayout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Go back"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
