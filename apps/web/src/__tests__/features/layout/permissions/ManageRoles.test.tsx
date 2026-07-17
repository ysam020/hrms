import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManageRoles from "@web/features/layout/permissions/ManageRoles";
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

vi.mock("@web/features/layout/permissions/CreateRoleModal", () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <span>Create Role Modal</span>
        <button onClick={props.handleClose}>close-create</button>
      </div>
    ) : null,
}));

vi.mock("@web/features/layout/permissions/RolePermissionsModal", () => ({
  default: (props: any) =>
    props.open ? <div>Permissions for {props.roleName}</div> : null,
}));

function renderWith(
  roles: any[],
  { loading = false, refetch = vi.fn(), setAlert = vi.fn() } = {},
) {
  mockUseFetchData.mockReturnValue({
    data: roles,
    loading,
    error: null,
    refetch,
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ManageRoles />
    </AlertContext.Provider>,
  );
}

const roleWithMembers = {
  _id: "role1",
  name: "Manager",
  assignedTo: [
    { username: "jdoe", fullName: "Jane Doe", imageURL: "" },
    { username: "bsmith", fullName: "Bob Smith", imageURL: "" },
  ],
};

const roleWithoutMembers = { _id: "role2", name: "Intern", assignedTo: [] };

describe("ManageRoles", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockPost.mockReset();
  });

  it("shows an empty state when there are no roles", () => {
    renderWith([]);
    expect(screen.getByText("No roles found")).toBeInTheDocument();
  });

  it("renders each role's name and member avatars", () => {
    renderWith([roleWithMembers, roleWithoutMembers]);
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Intern")).toBeInTheDocument();
    expect(screen.getByText("No users assigned")).toBeInTheDocument();
  });

  it("opens the Create Role modal from the toolbar", () => {
    renderWith([]);
    fireEvent.click(screen.getByLabelText("Create new role"));
    expect(screen.getByText("Create Role Modal")).toBeInTheDocument();
  });

  it("opens the Role Permissions modal for a role", () => {
    renderWith([roleWithMembers]);
    fireEvent.click(screen.getByLabelText("Manage Permissions"));
    expect(screen.getByText("Permissions for Manager")).toBeInTheDocument();
  });

  it("deletes a role after confirmation and refetches", async () => {
    mockDelete.mockResolvedValue({});
    const refetch = vi.fn();
    renderWith([roleWithMembers], { refetch });

    fireEvent.click(screen.getByLabelText("Delete role"));
    expect(
      screen.getByText('Are you sure you want to delete the role "Manager"?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete Role", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(expect.any(String)),
    );
    expect(refetch).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Are you sure you want to delete the role "Manager"?',
        ),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows a network-specific error message when role deletion fails offline", async () => {
    mockDelete.mockRejectedValue(new Error("Network Error"));
    const setAlert = vi.fn();
    renderWith([roleWithMembers], { setAlert });

    fireEvent.click(screen.getByLabelText("Delete role"));
    fireEvent.click(screen.getByText("Delete Role", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Network Error, please try again when online",
        }),
      ),
    );
  });

  it("shows the server error message when role deletion fails for another reason", async () => {
    mockDelete.mockRejectedValue({
      response: { data: { message: "Role is in use" } },
      message: "Request failed",
    });
    const setAlert = vi.fn();
    renderWith([roleWithMembers], { setAlert });

    fireEvent.click(screen.getByLabelText("Delete role"));
    fireEvent.click(screen.getByText("Delete Role", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Role is in use" }),
      ),
    );
  });

  it("opens the members popover on avatar-group click and shows each member", () => {
    renderWith([roleWithMembers]);
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);
    expect(screen.getByText("Manager Members")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("@bsmith")).toBeInTheDocument();
  });

  it("removes a member from the role after confirmation, refetches, and closes the popover", async () => {
    mockPost.mockResolvedValue({});
    const refetch = vi.fn();
    renderWith([roleWithMembers], { refetch });
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);

    fireEvent.click(screen.getByLabelText("Remove jdoe from role"));
    expect(
      screen.getByText(
        'Are you sure you want to remove "jdoe" from this role?',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        username: "jdoe",
        roleId: "role1",
      }),
    );
    expect(refetch).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Manager Members")).not.toBeInTheDocument(),
    );
  });

  it("closes the members popover via the close button", async () => {
    renderWith([roleWithMembers]);
    fireEvent.click(document.querySelector(".MuiAvatarGroup-root")!);
    expect(screen.getByText("Manager Members")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close role members panel"));
    await waitFor(() =>
      expect(screen.queryByText("Manager Members")).not.toBeInTheDocument(),
    );
  });
});
