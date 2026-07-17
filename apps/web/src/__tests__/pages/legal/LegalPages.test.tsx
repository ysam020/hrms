import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrivacyPolicyPage from "@web/pages/legal/PrivacyPolicyPage";
import TermsOfUsePage from "@web/pages/legal/TermsOfUsePage";
import RefundPolicyPage from "@web/pages/legal/RefundPolicyPage";

// Static legal content — no logic beyond LegalPageLayout (covered in its
// own test file). Light smoke test per page confirms each renders its
// correct title without crashing.
describe("Legal pages", () => {
  it("renders the Privacy Policy page", () => {
    render(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("renders the Terms of Use page", () => {
    render(
      <MemoryRouter>
        <TermsOfUsePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Terms of Use")).toBeInTheDocument();
  });

  it("renders the Refund & Cancellation Policy page", () => {
    render(
      <MemoryRouter>
        <RefundPolicyPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Refund & Cancellation Policy"),
    ).toBeInTheDocument();
  });
});
