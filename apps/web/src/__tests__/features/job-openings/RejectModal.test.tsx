import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RejectModal from "@web/features/job-openings/RejectModal";
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

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getJobApplications = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <RejectModal
        open={true}
        handleClose={handleClose}
        getJobApplications={getJobApplications}
        jobTitle="Software Engineer"
        _id="job1"
        applicantData={{
          id: "app1",
          name: "Jane Doe",
          email: "jane@example.com",
          aadharNo: "123456789012",
        }}
        {...overrides}
      />
    </AlertContext.Provider>,
  );
  return { handleClose, getJobApplications, setAlert };
}

describe("RejectModal", () => {
  beforeEach(() => mockPut.mockReset());

  it("shows candidate info and the job title", () => {
    renderModal();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("shows a placeholder when candidate fields are missing", () => {
    renderModal({ applicantData: { id: "app1" } });
    expect(screen.getAllByText("N/A")).toHaveLength(2);
  });

  it("requires a reason before submitting", async () => {
    renderModal();
    fireEvent.click(
      screen.getByText("Reject Application", { selector: "span" }),
    );
    // zod-formik-adapter shows a generic "Required" for an empty-string
    // min-length check rather than the custom message (known quirk,
    // documented elsewhere in this suite, e.g. Holidays.tsx).
    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("submits the rejection with candidate and job identifiers, then refreshes and closes", async () => {
    mockPut.mockResolvedValue({ data: { message: "Candidate rejected" } });
    const { handleClose, getJobApplications, setAlert } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("Reason for rejection"), {
      target: { value: "Not enough experience" },
    });
    fireEvent.click(
      screen.getByText("Reject Application", { selector: "span" }),
    );

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: "Not enough experience",
          name: "Jane Doe",
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
        message: "Candidate rejected",
      }),
    );
    expect(getJobApplications).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });
});
