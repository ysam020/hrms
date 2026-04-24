import { render, screen, fireEvent } from "@testing-library/react";
import PasswordStrength from "@web/shared/components/PasswordStrength";

vi.mock("primereact/password", () => ({
  Password: ({
    value,
    onChange,
    footer,
    toggleMask: _toggleMask,
    feedback: _feedback,
  }: any) => (
    <div>
      <input
        data-testid="password-input"
        type="password"
        value={value}
        onChange={onChange}
      />
      {footer && <div data-testid="password-footer">{footer}</div>}
    </div>
  ),
}));

vi.mock("@web/shared/validators", () => ({
  default: {
    passwordStrength: vi.fn(),
  },
}));

import validators from "@web/shared/validators";

const makeFormik = (overrides: any = {}) => ({
  values: { password: "" },
  errors: {},
  touched: {},
  handleChange: vi.fn(),
  setFieldValue: vi.fn(),
  ...overrides,
});

describe("PasswordStrength", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the password input", () => {
    const formik = makeFormik();
    render(
      <PasswordStrength
        name="password"
        formik={formik}
        value=""
        placeholder="Enter password"
      />,
    );
    expect(screen.getByTestId("password-input")).toBeInTheDocument();
  });

  it("renders the password requirements footer", () => {
    const formik = makeFormik();
    render(<PasswordStrength name="password" formik={formik} value="" />);
    expect(screen.getByTestId("password-footer")).toBeInTheDocument();
    expect(screen.getByText("Requirements:")).toBeInTheDocument();
  });

  it("footer lists all password requirements", () => {
    const formik = makeFormik();
    render(<PasswordStrength name="password" formik={formik} value="" />);
    expect(screen.getByText("Minimum 8 characters")).toBeInTheDocument();
    expect(
      screen.getByText("At least one uppercase letter"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("At least one lowercase letter"),
    ).toBeInTheDocument();
    expect(screen.getByText("At least one number")).toBeInTheDocument();
    expect(
      screen.getByText("At least one special character"),
    ).toBeInTheDocument();
  });

  it("calls formik.handleChange when input changes", () => {
    const formik = makeFormik();
    render(<PasswordStrength name="password" formik={formik} value="" />);
    fireEvent.change(screen.getByTestId("password-input"), {
      target: { value: "MyPass1!" },
    });
    expect(formik.handleChange).toHaveBeenCalled();
  });

  it("calls validators.passwordStrength when input changes", () => {
    const formik = makeFormik();
    render(<PasswordStrength name="password" formik={formik} value="" />);
    fireEvent.change(screen.getByTestId("password-input"), {
      target: { value: "Test123!" },
    });
    expect(validators.passwordStrength).toHaveBeenCalledWith("Test123!");
  });
});
