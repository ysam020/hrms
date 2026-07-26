import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InfoModal from "@web/features/job-openings/InfoModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { put: vi.fn(), get: vi.fn() },
}));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ value: e.target.value })}
    >
      <option value="" />
      {(props.options || []).map((opt: string) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label={props.placeholder}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(e.target.value) : null,
        })
      }
    />
  ),
}));
vi.mock("@web/shared/components/UserAutoComplete", () => ({
  default: (props: any) => (
    <select
      aria-label="Select new interviewer"
      onChange={(e) => props.formik.setFieldValue("username", e.target.value)}
    >
      <option value="" />
      {(props.userList || []).map((u: string) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  ),
}));

function makeApplicant(overrides: Partial<any> = {}) {
  return {
    id: "app1",
    name: "Jane Doe",
    email: "jane@example.com",
    aadharNo: "123456789012",
    status: "In Progress",
    interviews: [
      {
        roundNumber: 1,
        interviewer: "hr1",
        interviewConducted: false,
        interviewEndTime: "20200101T100000",
      },
    ],
    ...overrides,
  };
}

function renderModal(
  overrides: Partial<any> = {},
  { setAlert = vi.fn(), user = { isSuperUser: true } } = {},
) {
  const handleClose = vi.fn();
  const getJobApplications = vi.fn();
  const applicantData = makeApplicant(overrides.applicantData);
  const { applicantData: _omit, ...restOverrides } = overrides;
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <InfoModal
          open={true}
          handleClose={handleClose}
          getJobApplications={getJobApplications}
          jobTitle="Software Engineer"
          applicantData={applicantData}
          status={applicantData.status}
          interviews={applicantData.interviews}
          {...restOverrides}
        />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
  return { handleClose, getJobApplications, setAlert, applicantData };
}

describe("InfoModal", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockUseFetchData.mockReturnValue({
      data: [{ username: "jsmith" }],
      loading: false,
    });
  });

  it("renders the candidate header and timeline", () => {
    renderModal();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("Round 1")).toBeInTheDocument();
  });

  it("reassigns an interviewer for a round, using the round's own roundNumber", async () => {
    mockPut.mockResolvedValue({ data: { message: "Interviewer reassigned" } });
    const { getJobApplications, setAlert } = renderModal({
      applicantData: {
        interviews: [
          { roundNumber: 3, interviewer: "hr1", interviewConducted: false },
        ],
      },
    });

    fireEvent.click(screen.getByText("Reassign"));
    fireEvent.change(screen.getByLabelText("Select new interviewer"), {
      target: { value: "jsmith" },
    });
    fireEvent.click(screen.getByText("Assign"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          interviewer: "jsmith",
          interviewRound: 3,
          _id: "app1",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Interviewer reassigned",
      }),
    );
    expect(getJobApplications).toHaveBeenCalled();
    expect(await screen.findByText(/Interviewer: jsmith/)).toBeInTheDocument();
  });

  it("warns instead of submitting a reschedule with no date chosen", async () => {
    const setAlert = vi.fn();
    renderModal({}, { setAlert });
    fireEvent.click(screen.getByText("Reschedule"));
    fireEvent.click(screen.getByText("Confirm"));

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        message: "Please select a new date and time.",
      }),
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("reschedules an interview, setting a 1-hour window and resetting interviewConducted", async () => {
    mockPut.mockResolvedValue({ data: { message: "Interview rescheduled" } });
    const { setAlert } = renderModal();
    fireEvent.click(screen.getByText("Reschedule"));

    fireEvent.change(screen.getByLabelText("Select new date and time"), {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          interviewStartTime: "20300101T100000",
          interviewEndTime: "20300101T110000",
          roundNumber: 1,
          _id: "app1",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Interview rescheduled",
      }),
    );
  });

  it("shows the Connect Google Calendar prompt instead of an error toast when rescheduling reports CALENDAR_NOT_CONNECTED", async () => {
    mockPut.mockRejectedValue({
      response: {
        data: {
          message:
            "Connect your Google Calendar before scheduling an interview.",
          code: "CALENDAR_NOT_CONNECTED",
        },
      },
    });
    const { setAlert } = renderModal();
    fireEvent.click(screen.getByText("Reschedule"));

    fireEvent.change(screen.getByLabelText("Select new date and time"), {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.click(screen.getByText("Confirm"));

    expect(
      await screen.findByText("Connect Google Calendar", { selector: "h6" }),
    ).toBeInTheDocument();
    expect(setAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
  });

  // Both "no status selected" and "Completed with no feedback" guard
  // clauses in updateStatus() are defensive only — RoundExtra's Update
  // Status button is already `disabled` in both of those exact states, so
  // they're unreachable through the real UI (confirmed by inspection, not
  // exercised here).

  it("completes a round with feedback, marking the interview conducted and updating the status shown", async () => {
    mockPut.mockResolvedValue({ data: { message: "Status updated" } });
    const { setAlert } = renderModal({
      applicantData: {
        interviews: [
          {
            roundNumber: 2,
            interviewer: "hr1",
            interviewConducted: false,
            interviewEndTime: "20200101T100000",
          },
        ],
      },
    });

    fireEvent.change(screen.getByLabelText("Select interview status"), {
      target: { value: "Completed" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Interview feedback (required)"),
      {
        target: { value: "Solid technical round" },
      },
    );
    fireEvent.click(screen.getAllByText("Update Status").pop()!);

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: "Round 2 Completed",
          feedback: "Solid technical round",
          interviewRound: 2,
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Status updated",
      }),
    );
    expect(await screen.findByText("Round 2 Completed")).toBeInTheDocument();
  });

  it("hides Reassign/Reschedule across all rounds once the candidate is Hired", () => {
    renderModal({ status: "Hired", applicantData: { status: "Hired" } });
    expect(screen.queryByText("Reassign")).not.toBeInTheDocument();
    expect(screen.queryByText("Reschedule")).not.toBeInTheDocument();
  });

  it("saves the assigned official email for a Hired candidate", async () => {
    mockPut.mockResolvedValue({
      data: {
        success: true,
        data: { assignedOfficialEmail: "jane@acme.example" },
      },
    });
    const { setAlert } = renderModal({
      status: "Hired",
      applicantData: { status: "Hired", id: "app1" },
    });

    fireEvent.change(screen.getByPlaceholderText("e.g. jane@yourcompany.com"), {
      target: { value: "jane@acme.example" },
    });
    fireEvent.click(screen.getByLabelText("Save assigned official email"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        id: "app1",
        assignedOfficialEmail: "jane@acme.example",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Assigned official email updated.",
      }),
    );
  });
});
