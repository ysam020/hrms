import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ScheduleInterviewModal from "@web/features/job-openings/ScheduleInterviewModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { put: vi.fn(), get: vi.fn() },
}));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label={props.placeholder}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(e.target.value) : null,
        })
      }
      onBlur={props.onBlur}
    />
  ),
}));
vi.mock("@web/shared/components/UserAutoComplete", () => ({
  default: (props: any) => (
    <select
      aria-label={props.placeholder}
      onChange={(e) => props.formik.setFieldValue("username", e.target.value)}
      onBlur={() => props.formik.setFieldTouched("username", true)}
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

function setupFetch({
  maxInterviewRounds = 5,
  interviewers = ["jsmith"],
  interviewersLoading = false,
} = {}) {
  mockUseFetchData.mockImplementation((url: string) => {
    if (url.includes("interviewer")) {
      return {
        data: interviewers.map((username) => ({ username })),
        loading: interviewersLoading,
      };
    }
    return { data: { active: { maxInterviewRounds } }, loading: false };
  });
}

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getJobApplications = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ScheduleInterviewModal
        open={true}
        handleClose={handleClose}
        getJobApplications={getJobApplications}
        _id="job1"
        applicantData={{
          id: "app1",
          name: "Jane Doe",
          email: "jane@example.com",
          status: "",
          interviews: [],
        }}
        {...overrides}
      />
    </AlertContext.Provider>,
  );
  return { handleClose, getJobApplications, setAlert };
}

describe("ScheduleInterviewModal", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockGet.mockReset();
    setupFetch();
  });

  it("shows Round 1 for a fresh candidate", () => {
    renderModal();
    expect(screen.getByText("Round 1 Interview")).toBeInTheDocument();
  });

  it("shows a terminal warning and no form for a Hired candidate", () => {
    renderModal({
      applicantData: { id: "app1", status: "Hired", interviews: [] },
    });
    expect(screen.getByText(/already been/)).toBeInTheDocument();
    expect(
      screen.getByText("Hired", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Schedule Interview", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("blocks scheduling once the tenant's max round limit is reached", () => {
    setupFetch({ maxInterviewRounds: 1 });
    renderModal({
      applicantData: {
        id: "app1",
        status: "Round 1 Cleared",
        interviews: [{ roundNumber: 1, cleared: true }],
      },
    });
    expect(screen.getByText(/maximum of/)).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "strong" })).toBeInTheDocument();
  });

  it("blocks scheduling round N until round N-1 is Cleared", () => {
    renderModal({
      applicantData: {
        id: "app1",
        status: "Round 1 Completed",
        interviews: [{ roundNumber: 1, cleared: false }],
      },
    });
    expect(screen.getByText(/must be/)).toBeInTheDocument();
    expect(
      screen.getByText("Cleared", { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("allows scheduling round 2 once round 1 is Cleared", () => {
    renderModal({
      applicantData: {
        id: "app1",
        status: "Round 1 Cleared",
        interviews: [{ roundNumber: 1, cleared: true }],
      },
    });
    expect(screen.getByText("Round 2 Interview")).toBeInTheDocument();
    expect(
      screen.getByText("Schedule Interview", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("shows a loading message while interviewers load", () => {
    setupFetch({ interviewersLoading: true });
    renderModal();
    expect(
      screen.getByText("Loading eligible interviewers…"),
    ).toBeInTheDocument();
  });

  it("warns when no eligible interviewers are available", () => {
    setupFetch({ interviewers: [] });
    renderModal();
    expect(
      screen.getByText(/No users currently have interview-taking permission/),
    ).toBeInTheDocument();
  });

  it("requires an interviewer and a date/time before submitting", async () => {
    renderModal();
    fireEvent.click(
      screen.getByText("Schedule Interview", { selector: "span" }),
    );
    // zod-formik-adapter shows a generic "Required" for an empty-string
    // min-length check rather than the custom message (known quirk,
    // documented elsewhere in this suite, e.g. Holidays.tsx).
    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Please select date and time")).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("schedules the interview with a 1-hour window for the correct round", async () => {
    mockPut.mockResolvedValue({ data: { message: "Interview scheduled" } });
    const { handleClose, getJobApplications, setAlert } = renderModal();

    fireEvent.change(
      screen.getByLabelText("Choose interviewer from the list"),
      {
        target: { value: "jsmith" },
      },
    );
    fireEvent.change(screen.getByLabelText("Select interview date and time"), {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.click(
      screen.getByText("Schedule Interview", { selector: "span" }),
    );

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          interviewer: "jsmith",
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
        message: "Interview scheduled",
      }),
    );
    expect(handleClose).toHaveBeenCalled();
    expect(getJobApplications).toHaveBeenCalled();
  });

  it("shows the Connect Google Calendar prompt instead of an error toast when scheduling reports CALENDAR_NOT_CONNECTED", async () => {
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

    fireEvent.change(
      screen.getByLabelText("Choose interviewer from the list"),
      { target: { value: "jsmith" } },
    );
    fireEvent.change(screen.getByLabelText("Select interview date and time"), {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.click(
      screen.getByText("Schedule Interview", { selector: "span" }),
    );

    expect(
      await screen.findByText("Connect Google Calendar", { selector: "h6" }),
    ).toBeInTheDocument();
    expect(setAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
  });
});
