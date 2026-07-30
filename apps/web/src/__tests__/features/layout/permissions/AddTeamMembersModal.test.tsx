import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddTeamMembersModal from "@web/features/layout/permissions/AddTeamMembersModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useUserList from "@web/shared/hooks/useUserList";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useUserList");
const mockUseUserList = useUserList as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/autocomplete", () => ({
  AutoComplete: (props: any) => (
    <div>
      <input
        placeholder={props.placeholder}
        onChange={(e) => props.completeMethod({ query: e.target.value })}
      />
      {(props.suggestions || []).map((opt: any) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => props.onChange({ value: [...props.value, opt] })}
        >
          add-{opt.value}
        </button>
      ))}
    </div>
  ),
}));

const USERS = [
  { value: "u1", label: "Jane Doe" },
  { value: "u2", label: "Bob Smith" },
  { value: "u3", label: "Amy Lee" },
  { value: "u4", label: "Sam Patel" },
];

function renderWith({
  open = true,
  _id = "team1",
  teamName = "Engineering",
  setAlert = vi.fn(),
  handleClose = vi.fn(),
  getData = vi.fn(),
  userList = USERS,
  assignedUserIds = undefined as Set<string> | undefined,
} = {}) {
  mockUseUserList.mockReturnValue(userList);
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <AddTeamMembersModal
        open={open}
        _id={_id}
        teamName={teamName}
        handleClose={handleClose}
        getData={getData}
        assignedUserIds={assignedUserIds}
      />
    </AlertContext.Provider>,
  );
  return { setAlert, handleClose, getData };
}

describe("AddTeamMembersModal", () => {
  beforeEach(() => mockPut.mockReset());

  it("renders nothing when closed", () => {
    renderWith({ open: false });
    expect(screen.queryByText("Add Team Members")).not.toBeInTheDocument();
  });

  it("shows the team name and the count of users available for selection", () => {
    renderWith({ teamName: "Engineering" });
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("4 users available")).toBeInTheDocument();
  });

  it("falls back to 'Team Management' when no team name is given", () => {
    renderWith({ teamName: "" });
    expect(screen.getByText("Team Management")).toBeInTheDocument();
  });

  it("excludes users already assigned to a team from the available count and suggestions", async () => {
    renderWith({ assignedUserIds: new Set(["u2"]) });
    expect(screen.getByText("3 users available")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search team members..."), {
      target: { value: " " },
    });
    await waitFor(() => screen.getByText("add-u1"));
    expect(screen.queryByText("add-u2")).not.toBeInTheDocument();
  });

  it("shows a running count of selected members alongside the total available", async () => {
    renderWith();
    // fireEvent.change requires a value different from the input's current
    // ("") for React to fire onChange at all — every fixture label has a
    // space between first/last name, so " " matches all of them.
    fireEvent.change(screen.getByPlaceholderText("Search team members..."), {
      target: { value: " " },
    });
    await waitFor(() => screen.getByText("add-u1"));

    fireEvent.click(screen.getByText("add-u1"));
    expect(
      screen.getByText(/1 selected · 4 users available/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("add-u2"));
    fireEvent.click(screen.getByText("add-u3"));
    expect(
      screen.getByText(/3 selected · 4 users available/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("add-u4"));
    expect(
      screen.getByText(/4 selected · 4 users available/),
    ).toBeInTheDocument();
  });

  it("shows a warning and does not call the API when submitting with no members selected", async () => {
    const setAlert = vi.fn();
    renderWith({ setAlert });

    fireEvent.click(screen.getByText("Add Selected Members"));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "warning",
          message: "Please select at least one team member",
        }),
      ),
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("submits the selected members for the given team and shows a success alert", async () => {
    mockPut.mockResolvedValue({ data: { message: "2 members added" } });
    const { setAlert, handleClose, getData } = renderWith({ _id: "team1" });

    // fireEvent.change requires a value different from the input's current
    // ("") for React to fire onChange at all — every fixture label has a
    // space between first/last name, so " " matches all of them.
    fireEvent.change(screen.getByPlaceholderText("Search team members..."), {
      target: { value: " " },
    });
    await waitFor(() => screen.getByText("add-u1"));

    fireEvent.click(screen.getByText("add-u1"));
    fireEvent.click(screen.getByText("add-u2"));
    fireEvent.click(screen.getByText("Add Selected Members"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        members: ["u1", "u2"],
        teamId: "team1",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "2 members added",
      }),
    );
    expect(getData).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });
});
