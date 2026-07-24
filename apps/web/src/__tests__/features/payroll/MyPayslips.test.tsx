import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyPayslips from "@web/features/payroll/MyPayslips";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function makePayslip(overrides: Partial<any> = {}) {
  return {
    userId: "u1",
    month: 6,
    year: 2025,
    grossSalary: 80000,
    basicPay: 40000,
    netPayable: 70000,
    pf: 4800,
    tds: 2000,
    advanceDeduction: 1500,
    ...overrides,
  };
}

function renderPage(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <MyPayslips />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("MyPayslips", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    (window.URL as any).createObjectURL = vi.fn().mockReturnValue("blob:mock");
    (window.URL as any).revokeObjectURL = vi.fn();
  });

  it("fetches and renders payslip rows with formatted money and period", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { payslips: [makePayslip()] }, total: 1 },
    });
    renderPage();

    expect(await screen.findByText("Jun 2025")).toBeInTheDocument();
    expect(screen.getByText("₹80,000")).toBeInTheDocument();
    expect(screen.getByText("₹40,000")).toBeInTheDocument();
    expect(screen.getByText("₹70,000")).toBeInTheDocument();
    expect(screen.getByText("₹4,800")).toBeInTheDocument();
    expect(screen.getByText("₹2,000")).toBeInTheDocument();
    expect(screen.getByText("₹1,500")).toBeInTheDocument();

    expect(mockApiClient).toHaveBeenCalledWith(
      "/payroll/my-payslips?page=1&limit=12",
    );
  });

  it("shows an em-dash for missing TDS/advance-EMI values", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          payslips: [makePayslip({ tds: null, advanceDeduction: null })],
        },
        total: 1,
      },
    });
    renderPage();

    await screen.findByText("Jun 2025");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the empty state when there are no payslips", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { payslips: [] }, total: 0 },
    });
    renderPage();
    expect(await screen.findByText("No payslips found")).toBeInTheDocument();
  });

  it("shows an error alert when the payslip fetch fails", async () => {
    mockApiClient.mockRejectedValue(new Error("network down"));
    const { setAlert } = renderPage();

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith({
        open: true,
        message: "Failed to fetch payslips",
        severity: "error",
      }),
    );
  });

  it("downloads a payslip PDF via the row action", async () => {
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/payroll/my-payslips?page=1&limit=12")
        return Promise.resolve({
          data: { data: { payslips: [makePayslip()] }, total: 1 },
        });
      if (url === "/generate-salary-slip/u1/2025/6")
        return Promise.resolve({ data: new Blob(["pdf"]) });
      return Promise.reject(new Error("unexpected url " + url));
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderPage();

    await screen.findByText("Jun 2025");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    clickSpy.mockRestore();
  });

  it("shows the server's error message when a blob-response download fails", async () => {
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/payroll/my-payslips?page=1&limit=12")
        return Promise.resolve({
          data: { data: { payslips: [makePayslip()] }, total: 1 },
        });
      if (url === "/generate-salary-slip/u1/2025/6") {
        const blob = new Blob([
          JSON.stringify({ message: "Complete KYC first" }),
        ]);
        return Promise.reject({ response: { data: blob } });
      }
      return Promise.reject(new Error("unexpected url " + url));
    });
    const { setAlert } = renderPage();

    await screen.findByText("Jun 2025");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Complete KYC first",
          severity: "error",
        }),
      ),
    );
  });

  it("downloads the TDS worksheet via the row action", async () => {
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/payroll/my-payslips?page=1&limit=12")
        return Promise.resolve({
          data: { data: { payslips: [makePayslip()] }, total: 1 },
        });
      if (url === "/generate-tds-worksheet/u1/2025/6")
        return Promise.resolve({ data: new Blob(["pdf"]) });
      return Promise.reject(new Error("unexpected url " + url));
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderPage();

    await screen.findByText("Jun 2025");
    fireEvent.click(
      screen.getByRole("button", { name: "Download TDS Worksheet" }),
    );

    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("blocks Form 16 download and shows an alert when there are no payslips yet", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { payslips: [] }, total: 0 },
    });
    const { setAlert } = renderPage();

    await screen.findByText("No payslips found");
    fireEvent.click(screen.getByText("Download Form 16", { selector: "span" }));

    expect(setAlert).toHaveBeenCalledWith({
      open: true,
      message: "No payslips found yet to determine your employee record.",
      severity: "error",
    });
    expect(mockApiClient).not.toHaveBeenCalledWith(
      expect.stringContaining("/generate-form16"),
    );
  });

  it("downloads Form 16 for the selected financial year", async () => {
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/payroll/my-payslips?page=1&limit=12")
        return Promise.resolve({
          data: { data: { payslips: [makePayslip()] }, total: 1 },
        });
      if (url.startsWith("/generate-form16/"))
        return Promise.resolve({ data: new Blob(["pdf"]) });
      return Promise.reject(new Error("unexpected url " + url));
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderPage();

    await screen.findByText("Jun 2025");

    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    const options = await screen.findAllByRole("option");
    fireEvent.click(options[1]);

    fireEvent.click(screen.getByText("Download Form 16", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringMatching(/^\/generate-form16\/u1\//),
        { responseType: "blob" },
      ),
    );
    clickSpy.mockRestore();
  });

  it("re-fetches the next page when pagination changes", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { payslips: [makePayslip()] }, total: 30 },
    });
    renderPage();
    await screen.findByText("Jun 2025");

    const nextButtons = screen.getAllByRole("button", { name: /next/i });
    fireEvent.click(nextButtons[0]);

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        "/payroll/my-payslips?page=2&limit=12",
      ),
    );
  });
});
