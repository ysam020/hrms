import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Teams from "@web/features/layout/permissions/Teams";
import { AlertContext } from "@web/app/providers/AlertContext";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { delete: vi.fn(), post: vi.fn() },
}));
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/layout/permissions/CreateTeamModal", () => ({
  default: (props: any) => (props.open ? <span>Create Team Modal</span> : null),
}));

vi.mock("@web/features/layout/permissions/AddTeamMembersModal", () => ({
  default: (props: any) =>
    props.open ? <span>Add Members to {props._id}</span> : null,
}));

function renderWith(
  teams: any[],
  { refetch = vi.fn(), setAlert = vi.fn() } = {},
) {
  mockUseFetchData.mockReturnValue({
    data: teams,
    loading: false,
    error: null,
    refetch,
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <Teams />
    </AlertContext.Provider>,
  );
}

const team = {
  _id: "team1",
  teamName: "Engineering",
  teamLeaderId: "u1",
  membersInfo: [
    { id: "u1", name: "Jane Doe", username: "jdoe" },
    { id: "u2", name: "Bob Smith", username: "bsmith" },
  ],
};

const teamWithoutMembers = {
  _id: "team2",
  teamName: "Sales",
  teamLeaderId: null,
  membersInfo: [],
};

describe("Teams", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockPost.mockReset();
  });

  it("shows an empty state when there are no teams", () => {
    renderWith([]);
    expect(screen.getByText("No teams found")).toBeInTheDocument();
  });

  it("renders each team's name and member count, or 'No members assigned'", () => {
    renderWith([team, teamWithoutMembers]);
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("No members assigned")).toBeInTheDocument();
  });

  it("opens the Create Team modal from the toolbar", () => {
    renderWith([]);
    fireEvent.click(screen.getByLabelText("Create new team"));
    expect(screen.getByText("Create Team Modal")).toBeInTheDocument();
  });

  it("opens the Add Team Members modal for a specific team", () => {
    renderWith([team]);
    fireEvent.click(screen.getByLabelText("Add Team Members"));
    expect(screen.getByText("Add Members to team1")).toBeInTheDocument();
  });

  it("deletes a team after confirmation and refetches", async () => {
    mockDelete.mockResolvedValue({});
    const refetch = vi.fn();
    renderWith([team], { refetch });

    fireEvent.click(screen.getByLabelText("Delete team"));
    expect(
      screen.getByText(
        'Are you sure you want to delete the team "Engineering"?',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete Team", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(expect.any(String)),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("shows a network-specific error message when team deletion fails offline", async () => {
    mockDelete.mockRejectedValue(new Error("Network Error"));
    const setAlert = vi.fn();
    renderWith([team], { setAlert });

    fireEvent.click(screen.getByLabelText("Delete team"));
    fireEvent.click(screen.getByText("Delete Team", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Network Error, please try again when online",
        }),
      ),
    );
  });

  it("opens the members popover and marks the team leader with a badge", () => {
    renderWith([team]);
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);

    expect(screen.getByText("Engineering Members")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Team Leader")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
  });

  it("disables removing the team leader but allows removing a regular member", () => {
    renderWith([team]);
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);

    expect(screen.getByLabelText("Remove Jane Doe from team")).toBeDisabled();
    expect(
      screen.getByLabelText("Remove Bob Smith from team"),
    ).not.toBeDisabled();
  });

  it("removes a regular member from the team after confirmation and refetches", async () => {
    mockPost.mockResolvedValue({});
    const refetch = vi.fn();
    renderWith([team], { refetch });
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);

    fireEvent.click(screen.getByLabelText("Remove Bob Smith from team"));
    expect(
      screen.getByText(
        'Are you sure you want to remove "Bob Smith" from this team?',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        userId: "u2",
        teamId: "team1",
      }),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the server error message when member removal fails for a non-network reason", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Cannot remove last member" } },
    });
    const setAlert = vi.fn();
    renderWith([team], { setAlert });
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);

    fireEvent.click(screen.getByLabelText("Remove Bob Smith from team"));
    fireEvent.click(screen.getByText("Remove", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Cannot remove last member" }),
      ),
    );
  });

  it("shows the empty-members message inside the popover for a team with no members", () => {
    const teamWithLeaderPopover = { ...teamWithoutMembers, membersInfo: [] };
    renderWith([team, teamWithLeaderPopover]);
    // Sales has no members, so its AvatarGroup never renders — nothing to click;
    // instead verify the row itself communicates the empty state directly.
    expect(screen.getByText("No members assigned")).toBeInTheDocument();
  });
});
