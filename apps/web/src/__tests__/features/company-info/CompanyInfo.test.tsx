import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CompanyInfo from "@web/features/company-info/CompanyInfo";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

const PROFILE = {
  name: "Acme Corp",
  helpPhone: "+91 98765 43210",
  helpEmail: "hr@acme.com",
  officeAddress: "123 Main St",
  tan: "DELB12345C",
  website: "https://acme.com",
  workState: "Maharashtra",
};

function renderWith({
  user = { tenantRole: "owner" },
  setAlert = vi.fn(),
} = {}) {
  return render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <CompanyInfo />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
}

describe("CompanyInfo", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it("shows a loading spinner, then the error state when the fetch fails", async () => {
    mockGet.mockResolvedValue({ data: { success: false } });
    const { container } = renderWith();
    expect(
      container.querySelector(".MuiCircularProgress-root"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Failed to load company info. Please refresh."),
    ).toBeInTheDocument();
  });

  it("renders the organisation profile once loaded", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith();
    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("+91 98765 43210")).toBeInTheDocument();
    expect(screen.getByText("hr@acme.com")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("Maharashtra")).toBeInTheDocument();
    expect(screen.getByText("DELB12345C")).toBeInTheDocument();
    expect(screen.getByText("https://acme.com")).toBeInTheDocument();
  });

  it("links the phone, email, and website fields correctly", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith();
    await screen.findByText("Acme Corp");
    expect(screen.getByText("+91 98765 43210").closest("a")).toHaveAttribute(
      "href",
      "tel:+91 98765 43210",
    );
    expect(screen.getByText("hr@acme.com").closest("a")).toHaveAttribute(
      "href",
      "mailto:hr@acme.com",
    );
    expect(screen.getByText("https://acme.com").closest("a")).toHaveAttribute(
      "href",
      "https://acme.com",
    );
  });

  it("shows an admin-facing empty-contact message when canEdit and there is no contact info", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          orgProfile: {
            name: "Acme Corp",
            helpPhone: null,
            helpEmail: null,
            officeAddress: null,
            tan: null,
            website: null,
            workState: null,
          },
        },
      },
    });
    renderWith({ user: { tenantRole: "owner" } });
    expect(
      await screen.findByText(
        "No contact details added yet. Click Edit to add them.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a non-admin-facing empty-contact message for a regular employee", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          orgProfile: {
            name: "Acme Corp",
            helpPhone: null,
            helpEmail: null,
            officeAddress: null,
            tan: null,
            website: null,
            workState: null,
          },
        },
      },
    });
    renderWith({ user: { tenantRole: "employee", permissions: [] } });
    expect(
      await screen.findByText(
        "Contact details have not been added yet. Please check with your administrator.",
      ),
    ).toBeInTheDocument();
  });

  it("hides the Edit button for a regular employee without the override permission", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith({ user: { tenantRole: "employee", permissions: [] } });
    await screen.findByText("Acme Corp");
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("shows Edit for an employee with the explicit override permission", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith({
      user: {
        tenantRole: "employee",
        permissions: ["Organisation:edit_company_info"],
      },
    });
    await screen.findByText("Acme Corp");
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("prefills the edit dialog from the current profile", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith();
    await screen.findByText("Acme Corp");
    fireEvent.click(screen.getByText("Edit"));

    expect(screen.getByLabelText("Help phone number")).toHaveValue(
      "+91 98765 43210",
    );
    expect(screen.getByLabelText("Help email address")).toHaveValue(
      "hr@acme.com",
    );
    expect(screen.getByLabelText("TAN")).toHaveValue("DELB12345C");
  });

  it("uppercases the TAN as it is typed", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith();
    await screen.findByText("Acme Corp");
    fireEvent.click(screen.getByText("Edit"));

    fireEvent.change(screen.getByLabelText("TAN"), {
      target: { value: "delb99999z" },
    });
    expect(screen.getByLabelText("TAN")).toHaveValue("DELB99999Z");
  });

  it("saves the edited profile, nulling out any emptied fields", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    mockPut.mockResolvedValue({
      data: {
        success: true,
        data: { orgProfile: { ...PROFILE, website: null } },
      },
    });
    const setAlert = vi.fn();
    renderWith({ setAlert });
    await screen.findByText("Acme Corp");
    fireEvent.click(screen.getByText("Edit"));

    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          website: null,
          helpPhone: "+91 98765 43210",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Organisation profile updated.",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Edit Organisation Profile"),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the server error message when saving fails", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    mockPut.mockRejectedValue({
      response: { data: { message: "Invalid TAN format." } },
    });
    const setAlert = vi.fn();
    renderWith({ setAlert });
    await screen.findByText("Acme Corp");
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Invalid TAN format.",
        }),
      ),
    );
  });

  it("cancels the edit dialog without saving", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { orgProfile: PROFILE } },
    });
    renderWith();
    await screen.findByText("Acme Corp");
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Edit Organisation Profile"),
      ).not.toBeInTheDocument(),
    );
    expect(mockPut).not.toHaveBeenCalled();
  });
});
