import { render, screen, fireEvent } from "@testing-library/react";
import CheckboxWrapper from "@web/shared/components/CheckboxWrapper";

const makeFormik = (overrides: any = {}) => ({
  values: { agree: false },
  touched: {},
  errors: {},
  handleChange: vi.fn(),
  setFieldTouched: vi.fn(),
  ...overrides,
});

describe("CheckboxWrapper", () => {
  it("renders label text", () => {
    render(
      <CheckboxWrapper
        name="agree"
        label="I agree to terms"
        formik={makeFormik()}
      />,
    );
    expect(screen.getByText("I agree to terms")).toBeInTheDocument();
  });

  it("renders an unchecked checkbox by default", () => {
    render(
      <CheckboxWrapper name="agree" label="Agree" formik={makeFormik()} />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("renders a checked checkbox when formik value is true", () => {
    render(
      <CheckboxWrapper
        name="agree"
        label="Agree"
        formik={makeFormik({ values: { agree: true } })}
      />,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("calls formik.handleChange on change", () => {
    const handleChange = vi.fn();
    render(
      <CheckboxWrapper
        name="agree"
        label="Agree"
        formik={makeFormik({ handleChange })}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalled();
  });

  it("calls setFieldTouched on blur", () => {
    const setFieldTouched = vi.fn();
    render(
      <CheckboxWrapper
        name="agree"
        label="Agree"
        formik={makeFormik({ setFieldTouched })}
      />,
    );
    fireEvent.blur(screen.getByRole("checkbox"));
    expect(setFieldTouched).toHaveBeenCalledWith("agree", true);
  });

  it("shows error message when field is touched and has error", () => {
    render(
      <CheckboxWrapper
        name="agree"
        label="Agree"
        formik={makeFormik({
          touched: { agree: true },
          errors: { agree: "You must agree to continue" },
        })}
      />,
    );
    expect(screen.getByText("You must agree to continue")).toBeInTheDocument();
  });

  it("does not show error when field is not touched", () => {
    render(
      <CheckboxWrapper
        name="agree"
        label="Agree"
        formik={makeFormik({
          touched: {},
          errors: { agree: "Required" },
        })}
      />,
    );
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });
});
