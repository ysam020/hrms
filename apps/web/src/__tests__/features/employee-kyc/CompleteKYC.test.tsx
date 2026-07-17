import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CompleteKYC from "@web/features/employee-kyc/CompleteKYC";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components/FileUploadWrapper", () => ({
  default: (props: any) => (
    <div>
      <label htmlFor={props.name}>{props.label}</label>
      <input
        id={props.name}
        aria-label={props.label}
        value={props.formik.values[props.name] || ""}
        onChange={(e) => props.formik.setFieldValue(props.name, e.target.value)}
      />
      {props.revisionNote && <small>⚠ {props.revisionNote}</small>}
    </div>
  ),
}));

vi.mock("@web/shared/components/DropdownWrapper", () => ({
  default: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.formik.values[props.name] ?? ""}
      onChange={(e) => props.formik.setFieldValue(props.name, e.target.value)}
    >
      <option value="" />
      {props.options.map((o: string) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label={props.placeholder}
      type="text"
      value={props.value ? props.value.toISOString().slice(0, 10) : ""}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
    />
  ),
}));
vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      id={props.id}
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));

function renderWith(
  { edit = false, username }: { edit?: boolean; username?: string } = {},
  { setAlert = vi.fn(), user = { username: "me" } } = {},
) {
  const path = username ? `/kyc/${username}` : "/kyc";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={username ? "/kyc/:username" : "/kyc"}
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <UserContext.Provider value={{ user } as any}>
                <CompleteKYC edit={edit} username={username} />
              </UserContext.Provider>
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Employee Photo"), {
    target: { value: "photo.jpg" },
  });
  fireEvent.change(screen.getByLabelText("Date of Birth"), {
    target: { value: "1990-01-01" },
  });
  fireEvent.change(screen.getByPlaceholderText("Mobile"), {
    target: { value: "9876543210" },
  });
  fireEvent.change(screen.getByPlaceholderText("Email"), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Highest Qualification"), {
    target: { value: "B.Tech" },
  });
  fireEvent.change(screen.getAllByPlaceholderText("Address Line 1")[0], {
    target: { value: "123 Main St" },
  });
  fireEvent.change(screen.getAllByPlaceholderText("Address Line 2")[0], {
    target: { value: "Near Park" },
  });
  fireEvent.change(screen.getAllByPlaceholderText("City")[0], {
    target: { value: "Mumbai" },
  });
  fireEvent.change(screen.getAllByLabelText("State")[0], {
    target: { value: "Maharashtra" },
  });
  fireEvent.change(screen.getAllByPlaceholderText("PIN Code")[0], {
    target: { value: "400001" },
  });
  fireEvent.click(screen.getByLabelText("Same as Permanent Address"));
  fireEvent.change(screen.getByLabelText("AADHAR Front"), {
    target: { value: "aadhar-f.jpg" },
  });
  fireEvent.change(screen.getByLabelText("AADHAR Back"), {
    target: { value: "aadhar-b.jpg" },
  });
  fireEvent.change(screen.getByPlaceholderText("AADHAR Number"), {
    target: { value: "123456789012" },
  });
  fireEvent.change(screen.getByLabelText("PAN Card"), {
    target: { value: "pan.jpg" },
  });
  fireEvent.change(screen.getByPlaceholderText("PAN Number"), {
    target: { value: "ABCDE1234F" },
  });
  fireEvent.change(screen.getByPlaceholderText("Bank Account Number"), {
    target: { value: "1234567890" },
  });
  fireEvent.change(screen.getByPlaceholderText("Bank Name"), {
    target: { value: "Test Bank" },
  });
  fireEvent.change(screen.getByPlaceholderText("IFSC Code"), {
    target: { value: "TEST0001234" },
  });
}

describe("CompleteKYC", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockUseFetchData.mockReturnValue({ data: null, loading: false });
  });

  it("renders the form when not locked", () => {
    renderWith();
    expect(screen.getByText("Submit KYC")).toBeInTheDocument();
  });

  it.each([
    [
      "Approved",
      "This KYC is already finalized and can't be edited directly. Request an update from the KYC details page to make changes.",
    ],
    [
      "Rejected",
      "This KYC is already finalized and can't be edited directly. Request an update from the KYC details page to make changes.",
    ],
    [
      "Edit Requested",
      "An edit request is pending HR's approval. You'll be able to make changes once it's granted.",
    ],
  ])(
    "locks the form in edit mode when kyc_approval is %s",
    (status, message) => {
      mockUseFetchData.mockReturnValue({
        data: { kyc_approval: status },
        loading: false,
      });
      renderWith({ edit: true, username: "jdoe" });
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByText("Submit KYC")).not.toBeInTheDocument();
    },
  );

  it("does not lock a fresh (non-edit) submission even with a finalized status in fetched data", () => {
    mockUseFetchData.mockReturnValue({
      data: { kyc_approval: "Approved" },
      loading: false,
    });
    renderWith({ edit: false });
    expect(screen.getByText("Submit KYC")).toBeInTheDocument();
  });

  it("shows the revision banner and per-field revision notes when HR requested changes", () => {
    mockUseFetchData.mockReturnValue({
      data: {
        kyc_approval: "Revision Requested",
        kyc_revision_notes: { mobile: "Please provide a valid mobile number" },
      },
      loading: false,
    });
    renderWith({ edit: true, username: "jdoe" });
    expect(
      screen.getByText("HR requested a revision on the fields marked below"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("⚠ Please provide a valid mobile number"),
    ).toBeInTheDocument();
  });

  it("does not show the revision banner when there are no revision notes", () => {
    mockUseFetchData.mockReturnValue({
      data: { kyc_approval: "Revision Requested", kyc_revision_notes: {} },
      loading: false,
    });
    renderWith({ edit: true, username: "jdoe" });
    expect(screen.queryByText(/requested a revision/)).not.toBeInTheDocument();
  });

  it("prefills fetched user data into the form", () => {
    mockUseFetchData.mockReturnValue({
      data: { mobile: "9876543210", bank_name: "Test Bank" },
      loading: false,
    });
    renderWith({ edit: true, username: "jdoe" });
    expect(screen.getByPlaceholderText("Mobile")).toHaveValue("9876543210");
    expect(screen.getByPlaceholderText("Bank Name")).toHaveValue("Test Bank");
  });

  it("copies permanent address fields into communication address when 'Same as Permanent Address' is checked", () => {
    renderWith();
    fireEvent.change(screen.getAllByPlaceholderText("Address Line 1")[0], {
      target: { value: "123 Main St" },
    });
    fireEvent.click(screen.getByLabelText("Same as Permanent Address"));

    const line1Inputs = screen.getAllByDisplayValue("123 Main St");
    expect(line1Inputs.length).toBe(2);
  });

  it("clears communication address fields when 'Same as Permanent Address' is unchecked", () => {
    renderWith();
    fireEvent.change(screen.getAllByPlaceholderText("Address Line 1")[0], {
      target: { value: "123 Main St" },
    });
    const checkbox = screen.getByLabelText("Same as Permanent Address");
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(screen.getAllByDisplayValue("123 Main St")).toHaveLength(1);
  });

  it("submits a new KYC via POST, then resets the form entirely", async () => {
    mockPost.mockResolvedValue({ data: { message: "KYC submitted" } });
    const setAlert = vi.fn();
    renderWith({ edit: false }, { setAlert });
    await fillValidForm();

    fireEvent.click(screen.getByText("Submit KYC"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ mobile: "9876543210" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "KYC submitted",
      }),
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Mobile")).toHaveValue(""),
    );
  });

  it("submits an edit via PUT, keeping the form's values afterward", async () => {
    mockUseFetchData.mockReturnValue({
      data: { mobile: "9876543210" },
      loading: false,
    });
    mockPut.mockResolvedValue({ data: { message: "KYC updated" } });
    const setAlert = vi.fn();
    renderWith({ edit: true, username: "jdoe" }, { setAlert });
    await fillValidForm();

    fireEvent.click(screen.getByText("Submit KYC"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ mobile: "9876543210", username: "jdoe" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "KYC updated" }),
    );
    expect(screen.getByPlaceholderText("Mobile")).toHaveValue("9876543210");
  });
});
