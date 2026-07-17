import { render, screen, fireEvent } from "@testing-library/react";
import { RoundExtra } from "@web/features/job-openings/info-modal/RoundExtra";

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

function makeInterview(overrides: Partial<any> = {}) {
  return {
    interviewer: "hr1",
    interviewConducted: false,
    feedback: null,
    interviewEndTime: null,
    ...overrides,
  };
}

function baseProps(overrides: Partial<any> = {}) {
  return {
    interview: makeInterview(),
    index: 0,
    roundNumber: 1,
    status: "",
    isTerminalStatus: false,
    canReassign: false,
    canReschedule: false,
    canUpdateStatus: false,
    editIndex: null,
    rescheduleIndex: null,
    rescheduleDateTime: null,
    setRescheduleDateTime: vi.fn(),
    rescheduling: false,
    formik: {
      handleSubmit: vi.fn(),
      isSubmitting: false,
      values: {},
      setFieldValue: vi.fn(),
    },
    interviewersLoading: false,
    interviewerUsernames: [],
    statusInputs: {},
    setStatusInputs: vi.fn(),
    feedbackInputs: {},
    setFeedbackInputs: vi.fn(),
    onAssignClick: vi.fn(),
    onRescheduleClick: vi.fn(),
    onRescheduleCancel: vi.fn(),
    onRescheduleSubmit: vi.fn(),
    onCancelAssign: vi.fn(),
    onUpdateStatus: vi.fn(),
    ...overrides,
  };
}

describe("RoundExtra", () => {
  it("shows the interviewer name, or 'Not assigned' when absent", () => {
    render(
      <RoundExtra
        {...baseProps({ interview: makeInterview({ interviewer: null }) })}
      />,
    );
    expect(screen.getByText(/Not assigned/)).toBeInTheDocument();
  });

  it("hides Reassign/Reschedule when the caller lacks both permissions", () => {
    render(
      <RoundExtra
        {...baseProps({ canReassign: false, canReschedule: false })}
      />,
    );
    expect(screen.queryByText("Reassign")).not.toBeInTheDocument();
    expect(screen.queryByText("Reschedule")).not.toBeInTheDocument();
  });

  it("shows Reassign/Reschedule when permitted and not yet conducted/terminal", () => {
    render(
      <RoundExtra {...baseProps({ canReassign: true, canReschedule: true })} />,
    );
    expect(screen.getByText("Reassign")).toBeInTheDocument();
    expect(screen.getByText("Reschedule")).toBeInTheDocument();
  });

  it("hides Reassign/Reschedule once the round reached a terminal status", () => {
    render(
      <RoundExtra
        {...baseProps({
          canReassign: true,
          canReschedule: true,
          isTerminalStatus: true,
        })}
      />,
    );
    expect(screen.queryByText("Reassign")).not.toBeInTheDocument();
  });

  it("hides Reassign/Reschedule once the interview has been conducted", () => {
    render(
      <RoundExtra
        {...baseProps({
          canReassign: true,
          canReschedule: true,
          interview: makeInterview({ interviewConducted: true }),
        })}
      />,
    );
    expect(screen.queryByText("Reassign")).not.toBeInTheDocument();
  });

  it("opens the reschedule form and submits a new date", () => {
    const onRescheduleSubmit = vi.fn();
    render(
      <RoundExtra {...baseProps({ rescheduleIndex: 0, onRescheduleSubmit })} />,
    );
    expect(screen.getByText("Reschedule Interview")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm"));
    expect(onRescheduleSubmit).toHaveBeenCalledWith(0);
  });

  it("cancels the reschedule form", () => {
    const onRescheduleCancel = vi.fn();
    render(
      <RoundExtra {...baseProps({ rescheduleIndex: 0, onRescheduleCancel })} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onRescheduleCancel).toHaveBeenCalled();
  });

  it("shows a loading message for the reassign form while interviewers load", () => {
    render(
      <RoundExtra
        {...baseProps({ editIndex: 0, interviewersLoading: true })}
      />,
    );
    expect(
      screen.getByText("Loading eligible interviewers…"),
    ).toBeInTheDocument();
  });

  it("warns when no eligible interviewers are available", () => {
    render(
      <RoundExtra
        {...baseProps({
          editIndex: 0,
          interviewersLoading: false,
          interviewerUsernames: [],
        })}
      />,
    );
    expect(
      screen.getByText("No users currently have interview-taking permission."),
    ).toBeInTheDocument();
  });

  it("shows the interviewer picker and submits a reassignment", () => {
    const formik = {
      handleSubmit: vi.fn((e) => e.preventDefault()),
      isSubmitting: false,
      values: {},
      setFieldValue: vi.fn(),
    };
    render(
      <RoundExtra
        {...baseProps({ editIndex: 0, interviewerUsernames: ["jdoe"], formik })}
      />,
    );
    fireEvent.change(screen.getByLabelText("Select new interviewer"), {
      target: { value: "jdoe" },
    });
    expect(formik.setFieldValue).toHaveBeenCalledWith("username", "jdoe");
    fireEvent.click(screen.getByText("Assign"));
    expect(formik.handleSubmit).toHaveBeenCalled();
  });

  it("shows 'Interview Conducted: Yes/No' based on the interview state", () => {
    const { rerender } = render(
      <RoundExtra
        {...baseProps({
          interview: makeInterview({ interviewConducted: false }),
        })}
      />,
    );
    expect(screen.getByText("Interview Conducted: No")).toBeInTheDocument();

    rerender(
      <RoundExtra
        {...baseProps({
          interview: makeInterview({ interviewConducted: true }),
        })}
      />,
    );
    expect(screen.getByText("Interview Conducted: Yes")).toBeInTheDocument();
  });

  it("shows feedback only when present", () => {
    const { rerender } = render(
      <RoundExtra
        {...baseProps({ interview: makeInterview({ feedback: null }) })}
      />,
    );
    expect(screen.queryByText("Feedback")).not.toBeInTheDocument();

    rerender(
      <RoundExtra
        {...baseProps({
          interview: makeInterview({ feedback: "Great candidate" }),
        })}
      />,
    );
    expect(screen.getByText("Great candidate")).toBeInTheDocument();
  });

  it("hides the status-update section without canUpdateStatus", () => {
    render(<RoundExtra {...baseProps({ canUpdateStatus: false })} />);
    expect(screen.queryByText("Update Status")).not.toBeInTheDocument();
  });

  it("shows a 'come back later' notice when the interview hasn't ended yet", () => {
    render(
      <RoundExtra
        {...baseProps({
          canUpdateStatus: true,
          interview: makeInterview({ interviewEndTime: "99991231T235900" }),
        })}
      />,
    );
    expect(
      screen.getByText(
        /can be marked Completed\/Cleared after the scheduled interview ends/,
      ),
    ).toBeInTheDocument();
  });

  it("shows the status-update controls once the interview has ended, requiring feedback if not yet conducted", () => {
    const onUpdateStatus = vi.fn();
    render(
      <RoundExtra
        {...baseProps({
          canUpdateStatus: true,
          interview: makeInterview({
            interviewEndTime: "20200101T100000",
            interviewConducted: false,
          }),
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Update Status" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Select interview status"), {
      target: { value: "Completed" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Interview feedback (required)"),
      {
        target: { value: "Went well" },
      },
    );
  });

  it("does not require feedback text once the interview has already been conducted", () => {
    render(
      <RoundExtra
        {...baseProps({
          canUpdateStatus: true,
          interview: makeInterview({
            interviewEndTime: "20200101T100000",
            interviewConducted: true,
          }),
          statusInputs: { 0: "Cleared" },
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Update Status" }),
    ).not.toBeDisabled();
    expect(
      screen.queryByPlaceholderText("Interview feedback (required)"),
    ).not.toBeInTheDocument();
  });
});
