import { render, screen, fireEvent } from "@testing-library/react";
import InputWrapper from "@web/shared/components/InputWrapper";

// Mock PrimeReact components — they require browser canvas / DOM setup
vi.mock("primereact/inputtext", () => ({
  InputText: ({ id, value, onChange, onBlur, placeholder, ...rest }: any) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      data-testid="input-text"
      {...rest}
    />
  ),
}));

vi.mock("primereact/calendar", () => ({
  Calendar: ({ inputId, placeholder }: any) => (
    <input
      id={inputId}
      placeholder={placeholder}
      data-testid="calendar-input"
      readOnly
    />
  ),
}));

const makeFormik = (overrides: any = {}) => ({
  values: { name: "" },
  touched: {},
  errors: {},
  handleChange: vi.fn(),
  handleBlur: vi.fn(() => vi.fn()),
  setFieldValue: vi.fn(),
  setFieldTouched: vi.fn(),
  ...overrides,
});

describe("InputWrapper (text)", () => {
  it("renders label when provided", () => {
    render(
      <InputWrapper
        name="name"
        placeholder="Enter name"
        label="Full Name"
        formik={makeFormik()}
      />,
    );
    expect(screen.getByText("Full Name")).toBeInTheDocument();
  });

  it("renders required asterisk when required=true", () => {
    render(
      <InputWrapper
        name="name"
        placeholder="Name"
        label="Name"
        required
        formik={makeFormik()}
      />,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("does not render label when not provided", () => {
    render(
      <InputWrapper name="name" placeholder="Name" formik={makeFormik()} />,
    );
    expect(screen.queryByText("Full Name")).not.toBeInTheDocument();
  });

  it("renders the InputText component", () => {
    render(
      <InputWrapper name="name" placeholder="Name" formik={makeFormik()} />,
    );
    expect(screen.getByTestId("input-text")).toBeInTheDocument();
  });

  it("shows error message when touched and has error", () => {
    render(
      <InputWrapper
        name="name"
        placeholder="Name"
        formik={makeFormik({
          touched: { name: true },
          errors: { name: "Name is required" },
        })}
      />,
    );
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not show error when field not touched", () => {
    render(
      <InputWrapper
        name="name"
        placeholder="Name"
        formik={makeFormik({
          touched: {},
          errors: { name: "Name is required" },
        })}
      />,
    );
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("calls setFieldValue on text input change", () => {
    const setFieldValue = vi.fn();
    render(
      <InputWrapper
        name="name"
        placeholder="Name"
        formik={makeFormik({ setFieldValue })}
      />,
    );
    fireEvent.change(screen.getByTestId("input-text"), {
      target: { value: "Alice" },
    });
    expect(setFieldValue).toHaveBeenCalledWith("name", "Alice");
  });
});

describe("InputWrapper (date type)", () => {
  it("renders Calendar component for date type", () => {
    render(
      <InputWrapper
        type="date"
        name="dob"
        placeholder="Pick a date"
        formik={makeFormik({ values: { dob: "" } })}
      />,
    );
    expect(screen.getByTestId("calendar-input")).toBeInTheDocument();
  });
});

describe("InputWrapper (time type)", () => {
  it("renders Calendar component for time type", () => {
    render(
      <InputWrapper
        type="time"
        name="startTime"
        placeholder="Pick a time"
        formik={makeFormik({ values: { startTime: "" } })}
      />,
    );
    expect(screen.getByTestId("calendar-input")).toBeInTheDocument();
  });
});
