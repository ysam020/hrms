import { render, screen, fireEvent } from "@testing-library/react";
import DropdownWrapper from "@web/shared/components/DropdownWrapper";

vi.mock("primereact/dropdown", () => ({
  Dropdown: ({
    value,
    onChange,
    options,
    placeholder,
    onBlur,
    className,
  }: any) => (
    <select
      data-testid="dropdown"
      value={value}
      onChange={(e) => onChange({ target: { value: e.target.value } })}
      onBlur={onBlur}
      className={className}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {options?.map((opt: any) => (
        <option key={opt.value ?? opt} value={opt.value ?? opt}>
          {opt.label ?? opt}
        </option>
      ))}
    </select>
  ),
}));

const makeFormik = (overrides: any = {}) => ({
  values: { role: "" },
  errors: {},
  touched: {},
  setFieldValue: vi.fn(),
  setFieldTouched: vi.fn(),
  ...overrides,
});

const options = [
  { label: "Admin", value: "admin" },
  { label: "User", value: "user" },
];

describe("DropdownWrapper", () => {
  it("renders the dropdown", () => {
    render(
      <DropdownWrapper
        name="role"
        options={options}
        placeholder="Select role"
        formik={makeFormik()}
      />,
    );
    expect(screen.getByTestId("dropdown")).toBeInTheDocument();
  });

  it("renders available options", () => {
    render(
      <DropdownWrapper
        name="role"
        options={options}
        placeholder="Select role"
        formik={makeFormik()}
      />,
    );
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("calls setFieldValue when an option is selected", () => {
    const formik = makeFormik();
    render(
      <DropdownWrapper
        name="role"
        options={options}
        placeholder="Select role"
        formik={formik}
      />,
    );
    fireEvent.change(screen.getByTestId("dropdown"), {
      target: { value: "admin" },
    });
    expect(formik.setFieldValue).toHaveBeenCalledWith("role", "admin");
  });

  it("calls setFieldTouched on blur", () => {
    const formik = makeFormik();
    render(
      <DropdownWrapper
        name="role"
        options={options}
        placeholder="Select role"
        formik={formik}
      />,
    );
    fireEvent.blur(screen.getByTestId("dropdown"));
    expect(formik.setFieldTouched).toHaveBeenCalledWith("role", true);
  });

  it("shows error message when touched and invalid", () => {
    const formik = makeFormik({
      touched: { role: true },
      errors: { role: "Role is required" },
    });
    render(
      <DropdownWrapper
        name="role"
        options={options}
        placeholder="Select role"
        formik={formik}
      />,
    );
    expect(screen.getByText("Role is required")).toBeInTheDocument();
  });

  it("does not show error when field is not touched", () => {
    const formik = makeFormik({
      touched: {},
      errors: { role: "Role is required" },
    });
    render(
      <DropdownWrapper
        name="role"
        options={options}
        placeholder="Select role"
        formik={formik}
      />,
    );
    expect(screen.queryByText("Role is required")).not.toBeInTheDocument();
  });

  it("applies p-invalid class when there is a validation error", () => {
    const formik = makeFormik({
      touched: { role: true },
      errors: { role: "Required" },
    });
    render(<DropdownWrapper name="role" options={options} formik={formik} />);
    expect(screen.getByTestId("dropdown")).toHaveClass("p-invalid");
  });

  it("does not apply p-invalid class when there is no error", () => {
    render(
      <DropdownWrapper name="role" options={options} formik={makeFormik()} />,
    );
    expect(screen.getByTestId("dropdown")).not.toHaveClass("p-invalid");
  });

  it("renders with empty options list without crashing", () => {
    render(<DropdownWrapper name="role" options={[]} formik={makeFormik()} />);
    expect(screen.getByTestId("dropdown")).toBeInTheDocument();
  });
});
