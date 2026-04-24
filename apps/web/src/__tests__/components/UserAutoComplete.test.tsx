import { render, screen, fireEvent } from "@testing-library/react";
import UserAutoComplete from "@web/shared/components/UserAutoComplete";

vi.mock("primereact/autocomplete", () => ({
  AutoComplete: ({
    value,
    onChange,
    completeMethod,
    onBlur,
    placeholder,
    className,
  }: any) => (
    <input
      data-testid="autocomplete"
      value={value}
      onChange={(e) => {
        onChange({ value: e.target.value });
        completeMethod({ query: e.target.value });
      }}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
    />
  ),
}));

const makeFormik = (overrides: any = {}) => ({
  values: { username: "" },
  errors: {},
  touched: {},
  setFieldValue: vi.fn(),
  setFieldTouched: vi.fn(),
  ...overrides,
});

const userList = ["john.doe", "jane.smith", "alice.johnson"];

describe("UserAutoComplete", () => {
  it("renders the input", () => {
    render(<UserAutoComplete formik={makeFormik()} userList={userList} />);
    expect(screen.getByTestId("autocomplete")).toBeInTheDocument();
  });

  it("renders placeholder text", () => {
    render(
      <UserAutoComplete
        formik={makeFormik()}
        userList={userList}
        placeholder="Pick a user"
      />,
    );
    expect(screen.getByPlaceholderText("Pick a user")).toBeInTheDocument();
  });

  it("falls back to 'Select User' when no placeholder provided", () => {
    render(<UserAutoComplete formik={makeFormik()} userList={userList} />);
    expect(screen.getByPlaceholderText("Select User")).toBeInTheDocument();
  });

  it("uses customUserList when userList is not provided", () => {
    render(
      <UserAutoComplete formik={makeFormik()} customUserList={userList} />,
    );
    expect(screen.getByTestId("autocomplete")).toBeInTheDocument();
  });

  it("shows error message when touched and invalid", () => {
    const formik = makeFormik({
      touched: { username: true },
      errors: { username: "Username is required" },
    });
    render(<UserAutoComplete formik={formik} userList={userList} />);
    expect(screen.getByText("Username is required")).toBeInTheDocument();
  });

  it("does not show error when not touched", () => {
    const formik = makeFormik({
      touched: {},
      errors: { username: "Username is required" },
    });
    render(<UserAutoComplete formik={formik} userList={userList} />);
    expect(screen.queryByText("Username is required")).not.toBeInTheDocument();
  });

  it("applies p-invalid class when touched and invalid", () => {
    const formik = makeFormik({
      touched: { username: true },
      errors: { username: "Required" },
    });
    render(<UserAutoComplete formik={formik} userList={userList} />);
    expect(screen.getByTestId("autocomplete")).toHaveClass("p-invalid");
  });

  it("does not apply p-invalid when no error", () => {
    render(<UserAutoComplete formik={makeFormik()} userList={userList} />);
    expect(screen.getByTestId("autocomplete")).not.toHaveClass("p-invalid");
  });

  it("calls setFieldTouched on blur", () => {
    const formik = makeFormik();
    render(<UserAutoComplete formik={formik} userList={userList} />);
    fireEvent.blur(screen.getByTestId("autocomplete"));
    expect(formik.setFieldTouched).toHaveBeenCalledWith("username", true);
  });

  it("updates input value on change", () => {
    render(<UserAutoComplete formik={makeFormik()} userList={userList} />);
    fireEvent.change(screen.getByTestId("autocomplete"), {
      target: { value: "john" },
    });
    expect(screen.getByTestId("autocomplete")).toHaveValue("john");
  });
});
