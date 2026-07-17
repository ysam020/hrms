import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import ReportBuilder from "@web/features/reports/ReportBuilder";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
};

const EMPLOYEE_SCHEMA = {
  selectableFields: [
    "id",
    "fullName",
    "email",
    "department",
    "designation",
    "joiningDate",
  ],
  filterableFields: ["department", "designation"],
};
const ATTENDANCE_SCHEMA = {
  selectableFields: ["id", "date", "status"],
  filterableFields: [],
};

function setupApi(
  schemas: Record<string, any> = { employee: EMPLOYEE_SCHEMA },
) {
  mockApiClient.mockImplementation((url: string) => {
    const entity = url.split("/").pop()!;
    return Promise.resolve({ data: { data: schemas[entity] } });
  });
}

function comboboxes() {
  return screen.getAllByRole("combobox");
}

async function chooseOption(combobox: HTMLElement, optionText: string) {
  fireEvent.mouseDown(combobox);
  fireEvent.click(await screen.findByRole("option", { name: optionText }));
}

function renderBuilder(setAlert = vi.fn()) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <AlertContext.Provider value={{ setAlert } as any}>
        <ReportBuilder />
      </AlertContext.Provider>
    </ThemeContext.Provider>,
  );
  return { setAlert };
}

describe("ReportBuilder", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
  });

  it("loads the employee schema by default and pre-selects the first 5 columns", async () => {
    setupApi();
    renderBuilder();
    expect(await screen.findByText("id")).toBeInTheDocument();

    expect(screen.getByRole("checkbox", { name: "id" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "designation" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "joiningDate" }),
    ).not.toBeChecked();
  });

  it("resets columns/filters/results and refetches the schema when the entity changes", async () => {
    setupApi({ employee: EMPLOYEE_SCHEMA, attendance: ATTENDANCE_SCHEMA });
    renderBuilder();
    await screen.findByText("id");

    await chooseOption(comboboxes()[0], "Attendance");

    expect(await screen.findByText("status")).toBeInTheDocument();
    expect(screen.queryByText("fullName")).not.toBeInTheDocument();
  });

  it("toggles a column selection via its checkbox", async () => {
    setupApi();
    renderBuilder();
    await screen.findByText("id");

    const joiningDate = screen.getByRole("checkbox", { name: "joiningDate" });
    fireEvent.click(joiningDate);
    expect(joiningDate).toBeChecked();

    const idBox = screen.getByRole("checkbox", { name: "id" });
    fireEvent.click(idBox);
    expect(idBox).not.toBeChecked();
  });

  it("disables adding a filter when the entity has no filterable fields", async () => {
    setupApi({ employee: ATTENDANCE_SCHEMA });
    renderBuilder();
    await screen.findByText("id");
    expect(
      screen.getByText("3. Filters").parentElement!.querySelector("button"),
    ).toBeDisabled();
  });

  it("adds a filter defaulting to the first filterable field and 'eq', and can remove it", async () => {
    setupApi();
    renderBuilder();
    await screen.findByText("id");

    fireEvent.click(
      screen.getByText("3. Filters").parentElement!.querySelector("button")!,
    );
    const boxes = comboboxes();
    // [entity, filter.field, filter.operator, sort.field, sort.direction]
    expect(boxes).toHaveLength(5);
    expect(boxes[1]).toHaveTextContent("department");
    expect(boxes[2]).toHaveTextContent("eq");

    fireEvent.click(screen.getByTestId("DeleteIcon").closest("button")!);
    expect(comboboxes()).toHaveLength(3);
  });

  it("disables Run Report until at least one column is selected", async () => {
    setupApi();
    renderBuilder();
    await screen.findByText("id");

    // Uncheck all 5 pre-selected columns.
    ["id", "fullName", "email", "department", "designation"].forEach((col) =>
      fireEvent.click(screen.getByRole("checkbox", { name: col })),
    );

    // The "select at least one column" branch inside handleRun is guarded
    // by this same disabled condition, so it's unreachable through the UI
    // (confirmed by inspection, not exercised here) — mirrors the pattern
    // documented elsewhere in this suite (e.g. InfoModal.test.tsx).
    expect(
      screen.getByText("Run Report", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });

  it("runs the report and renders the results table, formatting null and boolean values", async () => {
    setupApi();
    mockApiClient.post.mockResolvedValue({
      data: {
        data: {
          rowCount: 2,
          rows: [
            { id: "1", fullName: "Jane Doe", isActive: true },
            { id: "2", fullName: null, isActive: false },
          ],
        },
      },
    });
    const { setAlert } = renderBuilder();
    await screen.findByText("id");

    fireEvent.click(screen.getByText("Run Report", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/reports/run",
        expect.objectContaining({
          entity: "employee",
          columns: ["id", "fullName", "email", "department", "designation"],
          filters: [],
          sort: undefined,
          limit: 100,
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "2 row(s) returned",
      }),
    );
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("2 rows")).toBeInTheDocument();
  });

  it("only includes filters that have a non-empty value in the run payload", async () => {
    setupApi();
    mockApiClient.post.mockResolvedValue({
      data: { data: { rowCount: 0, rows: [] } },
    });
    renderBuilder();
    await screen.findByText("id");

    fireEvent.click(
      screen.getByText("3. Filters").parentElement!.querySelector("button")!,
    );
    fireEvent.click(screen.getByText("Run Report", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/reports/run",
        expect.objectContaining({ filters: [] }),
      ),
    );
  });

  it("shows a 'no data' message when the report returns zero rows", async () => {
    setupApi();
    mockApiClient.post.mockResolvedValue({
      data: { data: { rowCount: 0, rows: [] } },
    });
    renderBuilder();
    await screen.findByText("id");
    fireEvent.click(screen.getByText("Run Report", { selector: "span" }));
    expect(
      await screen.findByText("No data matching the current filters."),
    ).toBeInTheDocument();
  });

  it("downloads a CSV via a blob link after running once", async () => {
    setupApi();
    mockApiClient.post
      .mockResolvedValueOnce({
        data: { data: { rowCount: 1, rows: [{ id: "1" }] } },
      })
      .mockResolvedValueOnce({ data: new Blob(["csv"]) });
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn();
    (global.URL as any).createObjectURL = createObjectURL;
    (global.URL as any).revokeObjectURL = revokeObjectURL;

    renderBuilder();
    await screen.findByText("id");
    fireEvent.click(screen.getByText("Run Report", { selector: "span" }));
    fireEvent.click(
      await screen.findByText("Download CSV", { selector: "span" }),
    );

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/reports/run",
        expect.objectContaining({ format: "csv" }),
        { responseType: "blob" },
      ),
    );
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("requires a name before saving, then saves and resets the dialog", async () => {
    setupApi();
    mockApiClient.post
      .mockResolvedValueOnce({
        data: { data: { rowCount: 1, rows: [{ id: "1" }] } },
      })
      .mockResolvedValueOnce({});
    const { setAlert } = renderBuilder();
    await screen.findByText("id");
    fireEvent.click(screen.getByText("Run Report", { selector: "span" }));
    fireEvent.click(
      await screen.findByText("Save Report", { selector: "span" }),
    );

    const saveBtn = screen
      .getByText("Save", { selector: "span" })
      .closest("button")!;
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Report Name"), {
      target: { value: "Active Employees" },
    });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/reports/saved",
        expect.objectContaining({
          name: "Active Employees",
          entity: "employee",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Report saved" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Save Report", { selector: "h2" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("clamps the row limit between 1 and 10000", async () => {
    setupApi();
    renderBuilder();
    await screen.findByText("id");

    const limitInput = screen.getByDisplayValue("100");
    fireEvent.change(limitInput, { target: { value: "999999" } });
    expect(limitInput).toHaveValue(10000);

    fireEvent.change(limitInput, { target: { value: "0" } });
    expect(limitInput).toHaveValue(1);
  });
});
