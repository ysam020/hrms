import { Dropdown } from "primereact/dropdown";
import React from "react";

function DropdownWrapper({
  name,
  options,
  placeholder,
  formik,
  label,
  required = false,
  inputProps = {},
}: {
  name: string;
  options: any[];
  placeholder?: string;
  formik: any;
  label?: string;
  required?: boolean;
  inputProps?: any;
}) {
  const hasError = formik.touched[name] && formik.errors[name];
  const errorId = `${name}-error`;

  return (
    <div className="form-field-container">
      {label && (
        <label
          htmlFor={name}
          style={{
            display: "block",
            marginBottom: "4px",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {label}
          {required && (
            <span
              aria-hidden="true"
              style={{ color: "#ef4444", marginLeft: "2px" }}
            >
              *
            </span>
          )}
        </label>
      )}
      <Dropdown
        inputId={name}
        value={formik.values[name]}
        onChange={(e) => formik.setFieldValue(name, e.target.value)}
        options={options}
        onBlur={() => formik.setFieldTouched(name, true)}
        placeholder={placeholder}
        appendTo="self"
        className={hasError ? "p-invalid" : ""}
        aria-required={required}
        aria-invalid={!!hasError}
        aria-describedby={hasError ? errorId : undefined}
        {...inputProps}
      />
      {hasError && (
        <small id={errorId} className="p-error" role="alert">
          {formik.errors[name]}
        </small>
      )}
    </div>
  );
}

export default React.memo(DropdownWrapper);
