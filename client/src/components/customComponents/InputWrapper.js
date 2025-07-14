import React from "react";
import { InputText } from "primereact/inputtext";
import { Calendar } from "primereact/calendar";

const InputWrapper = ({
  type = "text",
  name,
  placeholder,
  formik,
  inputProps = {},
  
}) => {
  const hasError = formik.touched[name] && formik.errors[name];

  const handleChange = (e) => {
    if (type === "date" && e.value) {
      const date = e.value;
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const formatted = `${year}-${month}-${day}`; // ISO format without timezone issues
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
            appendTo="self"
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
            appendTo="self"
            {...inputProps}
          />
        );
      default:
        return (
          <InputText
            value={formik.values[name]}
            onChange={handleChange}
            onBlur={formik.handleBlur(name)}
            placeholder={placeholder}
            className={hasError ? "p-invalid" : ""}
            {...inputProps}
          />
        );
    }
  };

  return (
    <div className="form-field-container">
      {renderInput()}
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
};

export default React.memo(InputWrapper);
