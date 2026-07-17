import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyTaxDeclaration from "@web/features/payroll/tax-declaration/MyTaxDeclaration";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
const FY = currentFinancialYear();

function renderWith(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <MyTaxDeclaration />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("MyTaxDeclaration", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("shows the 'Switch to Old Regime' prompt when no declaration exists yet", async () => {
    mockGet.mockResolvedValue({ data: { data: null } });
    renderWith();
    expect(
      await screen.findByText(`Switch to Old Regime for FY ${FY}`),
    ).toBeInTheDocument();
  });

  it("switches to the old regime, seeding an empty declaration, and refetches", async () => {
    mockGet.mockResolvedValue({ data: { data: null } });
    mockPost.mockResolvedValue({});
    renderWith();
    await screen.findByText(`Switch to Old Regime for FY ${FY}`);

    fireEvent.click(screen.getByText(`Switch to Old Regime for FY ${FY}`));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ financialYear: FY }),
      ),
    );
    expect(mockGet).toHaveBeenCalledTimes(2); // initial + refetch
  });

  it("shows an error alert when the declaration fails to load", async () => {
    const setAlert = vi.fn();
    mockGet.mockRejectedValue({
      response: { data: { message: "Server unavailable" } },
    });
    renderWith(setAlert);
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Server unavailable",
        }),
      ),
    );
  });

  it("shows editable fields and Save/Submit actions for a Draft declaration", async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: "Draft", financialYear: FY } },
    });
    renderWith();
    expect(
      await screen.findByLabelText("Monthly rent paid"),
    ).not.toBeDisabled();
    expect(screen.getByText("Save draft")).toBeInTheDocument();
    expect(screen.getByText("Submit for review")).toBeInTheDocument();
  });

  it("shows HR's revision notes for a RevisionRequested declaration", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: "RevisionRequested",
          financialYear: FY,
          revisionNotes: { monthlyRent: "Please provide rent receipts" },
        },
      },
    });
    renderWith();
    expect(
      await screen.findByText(/monthlyRent: Please provide rent receipts/),
    ).toBeInTheDocument();
  });

  it("locks the fields and hides Save/Submit while a declaration is under review", async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: "Submitted", financialYear: FY } },
    });
    renderWith();
    expect(await screen.findByText(/awaiting HR review/)).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly rent paid")).toBeDisabled();
    expect(screen.queryByText("Save draft")).not.toBeInTheDocument();
  });

  it("shows proof-submission fields only for line items with a declared amount, once Declared", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: "Declared",
          financialYear: FY,
          lineItems: [
            { code: "SEC80C", declaredAmount: 150000 },
            { code: "SEC80D_SELF", declaredAmount: 0 },
          ],
        },
      },
    });
    renderWith();
    expect(await screen.findByText(/Submit proofs below/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Section 80C — PF, ELSS, life insurance, PPF, etc. — proven amount",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(
        /Section 80D — Health insurance \(self\/family\) — proven amount/,
      ),
    ).not.toBeInTheDocument();
  });

  it("submits proofs with the entered amounts", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: "Declared",
          financialYear: FY,
          lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
        },
      },
    });
    mockPost.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(setAlert);
    const proofField = await screen.findByLabelText(
      "Section 80C — PF, ELSS, life insurance, PPF, etc. — proven amount",
    );
    fireEvent.change(proofField, { target: { value: "120000" } });

    fireEvent.click(screen.getByText("Submit proofs", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        financialYear: FY,
        proofs: { SEC80C: 120000 },
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Proofs submitted for verification.",
      }),
    );
  });

  it("shows the final declared-total summary once verified (no longer editable)", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          status: "Verified",
          financialYear: FY,
          lineItems: [
            { code: "SEC80C", declaredAmount: 150000 },
            { code: "SEC80D_SELF", declaredAmount: 25000 },
          ],
        },
      },
    });
    renderWith();
    expect(await screen.findByText(/verified for FY/)).toBeInTheDocument();
    expect(
      screen.getByText("Declared: ₹1,75,000 across all sections."),
    ).toBeInTheDocument();
  });

  it("saves a draft with the entered rent, metro toggle, and line items", async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: "Draft", financialYear: FY } },
    });
    mockPost.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByLabelText("Monthly rent paid");

    fireEvent.change(screen.getByLabelText("Monthly rent paid"), {
      target: { value: "25000" },
    });
    fireEvent.click(
      screen.getByLabelText("Metro city (Delhi/Mumbai/Kolkata/Chennai)"),
    );

    fireEvent.click(screen.getByText("Save draft"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          financialYear: FY,
          monthlyRent: 25000,
          isMetroCity: true,
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Draft saved." }),
    );
  });

  it("submits for review by saving a draft first, then calling the submit endpoint", async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: "Draft", financialYear: FY } },
    });
    mockPost.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByText("Submit for review");

    fireEvent.click(screen.getByText("Submit for review"));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][1]).toEqual({ financialYear: FY });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Declaration submitted for review.",
      }),
    );
  });
});
