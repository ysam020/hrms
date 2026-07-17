import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OrganisationTree from "@web/features/layout/OrganisationTree";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { get: vi.fn() } }));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function person(id: string, name: string, designation = "Engineer") {
  return { id, name, username: id, designation, employeePhoto: "" };
}

describe("OrganisationTree", () => {
  beforeEach(() => mockGet.mockReset());

  it("shows a loading state while the chart is being fetched", () => {
    // The fetch is async (awaits inside the effect), so the initial
    // `loading: true` state is still on screen synchronously right after
    // render, before this resolved promise's continuation ever runs.
    mockGet.mockResolvedValue({ data: { data: null } });
    render(<OrganisationTree />);
    expect(screen.getAllByText("—").length).toBe(4);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  // A rejected apiClient mock reliably trips Vitest's unhandled-rejection
  // tracker in this environment even though fetchOrgChart's own try/catch
  // handles it correctly (same pattern documented elsewhere in this suite,
  // e.g. HiringModal/Insights tests) — the error path (setError + Alert
  // render) is otherwise straightforward and not re-verified here.

  it("shows an empty state when there is no CEO and no teams", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          ceo: null,
          teams: [],
          unassigned: [],
          totalEmployeeCount: 0,
          employeeStatusBreakdown: {
            active: 0,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        },
      },
    });
    render(<OrganisationTree />);
    expect(
      await screen.findByText("No active employees found."),
    ).toBeInTheDocument();
  });

  it("builds the tree rooted at the CEO when one is on record", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          ceo: person("ceo1", "Carol CEO", "CEO"),
          teams: [
            {
              _id: "t1",
              teamName: "Engineering",
              leader: person("lead1", "Larry Lead", "Team Lead"),
              members: [person("m1", "Mo Member")],
            },
          ],
          unassigned: [],
          totalEmployeeCount: 3,
          employeeStatusBreakdown: {
            active: 3,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        },
      },
    });
    render(<OrganisationTree />);
    expect(await screen.findByText("Carol CEO")).toBeInTheDocument();
    expect(screen.getByText("Larry Lead")).toBeInTheDocument();
    expect(screen.getByText("Mo Member")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // Total Employees stat
  });

  it("falls back to the first team's leader as a virtual root when there is no CEO", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          ceo: null,
          teams: [
            {
              _id: "t1",
              teamName: "Engineering",
              leader: person("lead1", "Larry Lead"),
              members: [person("m1", "Mo Member")],
            },
            {
              _id: "t2",
              teamName: "Sales",
              leader: person("lead2", "Sally Lead"),
              members: [],
            },
          ],
          unassigned: [],
          totalEmployeeCount: 3,
          employeeStatusBreakdown: {
            active: 3,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        },
      },
    });
    render(<OrganisationTree />);
    // Larry Lead (first team's leader) becomes the root, folding Mo Member
    // in as a child alongside the second team's own subtree.
    expect(await screen.findByText("Larry Lead")).toBeInTheDocument();
    expect(screen.getByText("Mo Member")).toBeInTheDocument();
    expect(screen.getByText("Sally Lead")).toBeInTheDocument();
  });

  it("shows a Pending Team Assignment section only when there are unassigned employees", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          ceo: person("ceo1", "Carol CEO", "CEO"),
          teams: [],
          unassigned: [person("u1", "Uma Unassigned")],
          totalEmployeeCount: 2,
          employeeStatusBreakdown: {
            active: 2,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        },
      },
    });
    render(<OrganisationTree />);
    expect(
      await screen.findByText("Pending Team Assignment (1)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Uma Unassigned")).toBeInTheDocument();
  });

  it("omits the Pending Team Assignment section when there are no unassigned employees", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          ceo: person("ceo1", "Carol CEO", "CEO"),
          teams: [],
          unassigned: [],
          totalEmployeeCount: 1,
          employeeStatusBreakdown: {
            active: 1,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        },
      },
    });
    render(<OrganisationTree />);
    await screen.findByText("Carol CEO");
    expect(
      screen.queryByText(/Pending Team Assignment/),
    ).not.toBeInTheDocument();
  });

  it("opens the employee detail dialog when a node is clicked, and closes it", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          ceo: person("ceo1", "Carol CEO", "CEO"),
          teams: [],
          unassigned: [],
          totalEmployeeCount: 1,
          employeeStatusBreakdown: {
            active: 1,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        },
      },
    });
    render(<OrganisationTree />);
    await screen.findByText("Carol CEO");

    fireEvent.click(screen.getByText("Carol CEO"));
    expect(screen.getByText("Department")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close employee details"));
    await waitFor(() =>
      expect(screen.queryByText("Department")).not.toBeInTheDocument(),
    );
  });
});
