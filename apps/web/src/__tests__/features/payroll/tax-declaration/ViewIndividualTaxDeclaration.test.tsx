import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ViewIndividualTaxDeclaration from "@web/features/payroll/tax-declaration/ViewIndividualTaxDeclaration";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function makeDeclaration(overrides: Partial<any> = {}) {
  return {
    status: "Submitted",
    financialYear: "2024-25",
    employee: { first_name: "Jane", last_name: "Doe", username: "jdoe" },
    monthlyRent: 20000,
    isMetroCity: true,
    lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
    ...overrides,
  };
}

function renderWith(
  setAlert = vi.fn(),
  path = "/payroll/tax-declarations/u1?financialYear=2024-25",
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <Routes>
          <Route
            path="/payroll/tax-declarations/:userId"
            element={<ViewIndividualTaxDeclaration />}
          />
        </Routes>
      </AlertContext.Provider>
    </MemoryRouter>,
  );
}

describe("ViewIndividualTaxDeclaration", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("shows an info alert scoped to the FY when there is no declaration", async () => {
    mockGet.mockResolvedValue({ data: { data: null } });
    renderWith();
    expect(
      await screen.findByText("No tax declaration found for FY 2024-25."),
    ).toBeInTheDocument();
  });

  it("renders the employee name, status, HRA info, and declared line items", async () => {
    mockGet.mockResolvedValue({ data: { data: makeDeclaration() } });
    renderWith();
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(
      screen.getByText("Monthly rent: ₹20000 • Metro city"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Section 80C: ₹150000 declared"),
    ).toBeInTheDocument();
  });

  it("shows the proven amount alongside the declared amount once proofs exist", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: makeDeclaration({
          lineItems: [
            { code: "SEC80C", declaredAmount: 150000, proofAmount: 120000 },
          ],
        }),
      },
    });
    renderWith();
    expect(
      await screen.findByText("Section 80C: ₹150000 declared / ₹120000 proven"),
    ).toBeInTheDocument();
  });

  it("falls back to the username when the employee has no name on file", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ employee: { username: "jdoe" } }) },
    });
    renderWith();
    expect(await screen.findByText("jdoe")).toBeInTheDocument();
  });

  it("shows HR's revision notes when present", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: makeDeclaration({
          revisionNotes: { monthlyRent: "Needs receipts" },
        }),
      },
    });
    renderWith();
    expect(
      await screen.findByText("monthlyRent: Needs receipts"),
    ).toBeInTheDocument();
  });

  it("shows Approve/Request revision only while Submitted", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ status: "Submitted" }) },
    });
    renderWith();
    expect(await screen.findByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Request revision")).toBeInTheDocument();
    expect(screen.queryByText("Verify proofs")).not.toBeInTheDocument();
  });

  it("shows Verify proofs/Request proof revision only while ProofsSubmitted", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ status: "ProofsSubmitted" }) },
    });
    renderWith();
    expect(await screen.findByText("Verify proofs")).toBeInTheDocument();
    expect(screen.getByText("Request proof revision")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  });

  it("approves the declaration after confirmation and refetches", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ status: "Submitted" }) },
    });
    mockPost.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByText("Approve");

    fireEvent.click(screen.getByText("Approve"));
    expect(
      screen.getByText(
        /Are you sure you want to approve the tax declaration for Jane Doe/,
      ),
    ).toBeInTheDocument();
    const approveButtons = screen.getAllByText("Approve", { selector: "span" });
    fireEvent.click(approveButtons[approveButtons.length - 1]);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        userId: "u1",
        financialYear: "2024-25",
        decision: "Declared",
        revisionNotes: undefined,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Declaration approved.",
      }),
    );
  });

  it("requires a revision note before Send is enabled, then submits it", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ status: "Submitted" }) },
    });
    mockPost.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByText("Request revision");

    fireEvent.click(screen.getByText("Request revision"));
    expect(
      screen.getByText("Request revision", {
        selector: ".MuiDialogTitle-root",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("What needs to change?"), {
      target: { value: "Please attach rent receipts" },
    });
    expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        userId: "u1",
        financialYear: "2024-25",
        decision: "RevisionRequested",
        revisionNotes: { general: "Please attach rent receipts" },
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Revision requested.",
      }),
    );
  });

  it("verifies submitted proofs after confirmation", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ status: "ProofsSubmitted" }) },
    });
    mockPost.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByText("Verify proofs");

    fireEvent.click(screen.getByText("Verify proofs"));
    fireEvent.click(screen.getByText("Verify", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ decision: "Verified" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Proofs verified.",
      }),
    );
  });

  it("cancels the revision dialog without submitting", async () => {
    mockGet.mockResolvedValue({
      data: { data: makeDeclaration({ status: "Submitted" }) },
    });
    renderWith();
    await screen.findByText("Request revision");

    fireEvent.click(screen.getByText("Request revision"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockPost).not.toHaveBeenCalled();
  });
});
