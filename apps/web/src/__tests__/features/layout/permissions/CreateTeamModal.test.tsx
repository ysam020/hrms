import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateTeamModal from "@web/features/layout/permissions/CreateTeamModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useUserList from "@web/shared/hooks/useUserList";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useUserList");
const mockUseUserList = useUserList as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/multiselect", () => ({
  MultiSelect: (props: any) => (
    <div>
      <span data-testid="members-value">{JSON.stringify(props.value)}</span>
      {(props.options || []).map((opt: any) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => props.onChange({ value: [...props.value, opt.value] })}
        >
          add-{opt.value}
        </button>
      ))}
      <button type="button" onClick={() => props.onChange({ value: [] })}>
        clear-members
      </button>
    </div>
  ),
}));

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      disabled={props.disabled}
      value={props.value || ""}
      onChange={(e) => props.onChange({ value: e.target.value || "" })}
    >
      <option value="">-- none --</option>
      {(props.options || []).map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

const USERS = [
  { value: "u1", label: "Jane Doe" },
  { value: "u2", label: "Bob Smith" },
];

function renderWith(
  open: boolean,
  { setAlert = vi.fn(), handleClose = vi.fn(), getData = vi.fn() } = {},
) {
  mockUseUserList.mockReturnValue(USERS);
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <CreateTeamModal
        open={open}
        handleClose={handleClose}
        getData={getData}
      />
    </AlertContext.Provider>,
  );
  return { setAlert, handleClose, getData };
}

describe("CreateTeamModal", () => {
  beforeEach(() => mockPost.mockReset());

  it("renders nothing when closed", () => {
    renderWith(false);
    expect(screen.queryByText("Create New Team")).not.toBeInTheDocument();
  });

  it("disables the submit button and the leader dropdown until fields are filled in", () => {
    renderWith(true);
    expect(screen.getByText("Create Team")).toBeInTheDocument();
    expect(document.querySelector('button[type="submit"]')).toBeDisabled();
    expect(screen.getByLabelText("Select team leader...")).toBeDisabled();
    expect(
      screen.getByText("Select team members first to choose a team leader"),
    ).toBeInTheDocument();
  });

  it("shows a running member-count summary as members are added", () => {
    renderWith(true);
    fireEvent.click(screen.getByText("add-u1"));
    expect(screen.getByText(/1 member\(s\) selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("add-u2"));
    expect(screen.getByText(/2 member\(s\) selected/)).toBeInTheDocument();
  });

  it("only offers selected members as team-leader options", () => {
    renderWith(true);
    fireEvent.click(screen.getByText("add-u1"));
    const leaderSelect = screen.getByLabelText(
      "Select team leader...",
    ) as HTMLSelectElement;
    expect(leaderSelect).not.toBeDisabled();
    const optionValues = Array.from(leaderSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(["", "u1"]);
  });

  it("resets the selected team leader if they're removed from the member list", () => {
    renderWith(true);
    fireEvent.click(screen.getByText("add-u1"));
    fireEvent.change(screen.getByLabelText("Select team leader..."), {
      target: { value: "u1" },
    });
    expect(
      screen.getByText(/Jane Doe selected as team leader/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("clear-members"));

    expect(
      screen.queryByText(/selected as team leader/),
    ).not.toBeInTheDocument();
  });

  it("enables Submit once name, members, and a leader are all set", () => {
    renderWith(true);
    fireEvent.click(screen.getByText("add-u1"));
    fireEvent.change(screen.getByLabelText("Select team leader..."), {
      target: { value: "u1" },
    });
    expect(document.querySelector('button[type="submit"]')).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText(
        "Enter team name (e.g., Development Team, Marketing Squad)",
      ),
      { target: { value: "Engineering" } },
    );

    expect(document.querySelector('button[type="submit"]')).not.toBeDisabled();
  });

  it("submits the team with trimmed name, members, and leader; shows success and closes", async () => {
    mockPost.mockResolvedValue({ data: { message: "Team created" } });
    const { setAlert, handleClose, getData } = renderWith(true);

    fireEvent.change(
      screen.getByPlaceholderText(
        "Enter team name (e.g., Development Team, Marketing Squad)",
      ),
      { target: { value: "  Engineering  " } },
    );
    fireEvent.click(screen.getByText("add-u1"));
    fireEvent.click(screen.getByText("add-u2"));
    fireEvent.change(screen.getByLabelText("Select team leader..."), {
      target: { value: "u1" },
    });

    fireEvent.click(document.querySelector('button[type="submit"]')!);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        team_name: "Engineering",
        members: ["u1", "u2"],
        teamLeaderId: "u1",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Team created" }),
    );
    expect(getData).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });
});
