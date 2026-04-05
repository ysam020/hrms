import React from "react";
import { InputText } from "primereact/inputtext";
import { Calendar } from "primereact/calendar";

const InputWrapper = ({
  type = "text",
  name,
  placeholder,
  formik,
  inputProps = {},
  label,
  required = false,

  multiline: _multiline,

  rows: _rows,

  ...restProps
}: {
  [x: string]: any;
  type?: string;
  name: any;
  placeholder: any;
  formik: any;
  inputProps?: {};
  label?: any;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
}) => {
  const hasError = formik.touched[name] && formik.errors[name];

  const handleChange = (e: any) => {
    if (type === "date" && e.value) {
      const date = e.value;
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const formatted = `${year}-${month}-${day}`;
      formik.setFieldValue(name, formatted);
    } else if (type === "time" && e.value) {
      const hours = String(e.value.getHours()).padStart(2, "0");
      const minutes = String(e.value.getMinutes()).padStart(2, "0");
      const formattedTime = `${hours}:${minutes}`;
      formik.setFieldValue(name, formattedTime);
    } else if (type === "text") {
      formik.setFieldValue(name, e.target.value);
    } else {
      formik.setFieldValue(name, "");
    }
  };

  const renderInput = () => {
    switch (type) {
      case "date":
        return (
          <Calendar
            value={
              formik.values[name]
                ? new Date(`${formik.values[name]}T00:00:00`)
                : null
            }
            onChange={handleChange}
            onBlur={() => formik.setFieldTouched(name, true)}
            minDate={new Date()}
            dateFormat="dd/mm/yy"
            showIcon
            showButtonBar
            placeholder={placeholder}
            className={hasError ? "p-invalid" : ""}
            appendTo={() => document.querySelector("#root .App") as HTMLElement}
            inputId={name}
            aria-required={required}
            aria-invalid={!!hasError}
            aria-describedby={hasError ? `${name}-error` : undefined}
            {...inputProps}
          />
        );
      case "time":
        return (
          <Calendar
            value={
              formik.values[name]
                ? new Date(`1970-01-01T${formik.values[name]}`)
                : null
            }
            onChange={handleChange}
            onBlur={() => formik.setFieldTouched(name, true)}
            timeOnly
            showIcon
            hourFormat="12"
            placeholder={placeholder}
            className={hasError ? "p-invalid" : ""}
            appendTo={"self"}
            inputId={name}
            aria-required={required}
            aria-invalid={!!hasError}
            aria-describedby={hasError ? `${name}-error` : undefined}
            {...inputProps}
          />
        );
      default:
        return (
          <InputText
            id={name}
            value={formik.values[name]}
            onChange={handleChange}
            onBlur={formik.handleBlur(name)}
            placeholder={placeholder}
            className={hasError ? "p-invalid" : ""}
            aria-required={required}
            aria-invalid={!!hasError}
            aria-describedby={hasError ? `${name}-error` : undefined}
            {...inputProps}
          />
        );
    }
  };

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
      {renderInput()}
      {hasError && (
        <small id={`${name}-error`} className="p-error" role="alert">
          {formik.errors[name]}
        </small>
      )}
    </div>
  );
};

export default React.memo(InputWrapper);
