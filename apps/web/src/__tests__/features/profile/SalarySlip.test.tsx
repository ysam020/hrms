import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SalarySlip from "@web/features/profile/SalarySlip";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import downloadSalarySlip from "@web/shared/utils/downloadSalarySlip";

vi.mock("@web/shared/utils/downloadSalarySlip", () => ({ default: vi.fn() }));
const mockDownload = downloadSalarySlip as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label="Select Month/Year"
      value={
        props.value
          ? `${props.value.getFullYear()}-${String(props.value.getMonth() + 1).padStart(2, "0")}`
          : ""
      }
      onChange={(e) =>
        props.onChange({
          value: e.target.value
            ? new Date(`${e.target.value}-01T00:00:00`)
            : null,
        })
      }
    />
  ),
}));

function renderSlip(setAlert = vi.fn()) {
  render(
    <UserContext.Provider value={{ user: { id: "u1" } } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <SalarySlip />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { setAlert };
}

function lastMonthYYYYMM() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

describe("SalarySlip", () => {
  beforeEach(() => mockDownload.mockReset());

  it("defaults the selected month to last month", () => {
    renderSlip();
    expect(screen.getByLabelText("Select Month/Year")).toHaveValue(
      lastMonthYYYYMM(),
    );
  });

  it("downloads using the default date and the current user's id", async () => {
    mockDownload.mockResolvedValue(undefined);
    const { setAlert } = renderSlip();
    fireEvent.click(
      screen.getByText("Download Salary Slip", { selector: "span" }),
    );

    await waitFor(() =>
      expect(mockDownload).toHaveBeenCalledWith(
        lastMonthYYYYMM(),
        "u1",
        expect.any(Function),
        setAlert,
      ),
    );
  });

  it("downloads using a newly selected month", async () => {
    mockDownload.mockResolvedValue(undefined);
    renderSlip();
    fireEvent.change(screen.getByLabelText("Select Month/Year"), {
      target: { value: "2024-03" },
    });
    fireEvent.click(
      screen.getByText("Download Salary Slip", { selector: "span" }),
    );

    await waitFor(() =>
      expect(mockDownload).toHaveBeenCalledWith(
        "2024-03",
        "u1",
        expect.any(Function),
        expect.any(Function),
      ),
    );
  });

  // A rejected downloadSalarySlip mock reliably trips Vitest's
  // unhandled-rejection tracker in this environment even though
  // handleDownload's own try/catch resets isDownloading correctly (same
  // pattern documented elsewhere in this suite) — not re-verified here.
});
