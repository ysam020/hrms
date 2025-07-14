import { Dropdown } from "primereact/dropdown";
import React from "react";

function DropdownWrapper({
  name,
  options,
  placeholder,
  formik,
  inputProps = {},
}) {
  const hasError = formik.touched[name] && formik.errors[name];

  return (
    <div className="form-field-container">
      <Dropdown
        value={formik.values[name]}
        onChange={(e) => formik.setFieldValue(name, e.target.value)}
        options={options}
        onBlur={() => formik.setFieldTouched(name, true)}
        placeholder={placeholder}
        appendTo="self"
        className={hasError ? "p-invalid" : ""}
        {...inputProps}
      />
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
}

export default React.memo(DropdownWrapper);
