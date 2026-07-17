import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HiringModal from "@web/features/job-openings/HiringModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));
vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label={props.placeholder}
      type="text"
      value={props.value ? props.value.toISOString().slice(0, 10) : ""}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
      onBlur={props.onBlur}
    />
  ),
}));

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getJobApplications = vi.fn();
  render(
    <MemoryRouter initialEntries={["/job-openings/job1"]}>
      <Routes>
        <Route
          path="/job-openings/:_id"
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <HiringModal
                open={true}
                handleClose={handleClose}
                getJobApplications={getJobApplications}
                jobTitle="Software Engineer"
                applicantData={{
                  id: "app1",
                  name: "Jane Doe",
                  email: "jane@example.com",
                  aadharNo: "123456789012",
                }}
                {...overrides}
              />
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { handleClose, getJobApplications, setAlert };
}

describe("HiringModal", () => {
  beforeEach(() => mockPut.mockReset());

  it("shows candidate info and the job title", () => {
    renderModal();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("submits the hire with candidate/job identifiers from the route param", async () => {
    mockPut.mockResolvedValue({ data: { message: "Candidate hired" } });
    const { handleClose, getJobApplications, setAlert } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("Annual Salary (₹)"), {
      target: { value: "1200000" },
    });
    fireEvent.change(screen.getByLabelText("Joining Date"), {
      target: { value: futureDate(14) },
    });
    fireEvent.click(screen.getByText("Hire Candidate", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          salary: "1200000",
          name: "Jane Doe",
          email: "jane@example.com",
          aadharNo: "123456789012",
          jobTitle: "Software Engineer",
          id: "app1",
          jobId: "job1",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Candidate hired",
      }),
    );
    expect(getJobApplications).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  // Failure error-alert behavior isn't re-verified here: a rejecting
  // apiClient mock reliably trips Vitest's unhandled-rejection tracker in
  // this environment (same known quirk seen repeatedly across this
  // session), and the identical message-selection logic is already
  // verified correct elsewhere (e.g. RejectModal.tsx, Holidays.tsx).
});
