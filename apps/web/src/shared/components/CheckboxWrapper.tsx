import React from "react";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

function CheckboxWrapper({
  name,
  label,
  formik,
}: {
  name: string;
  label: string;
  formik: any;
}) {
  const hasError = formik.touched[name] && formik.errors[name];
  const errorId = `${name}-error`;

  return (
    <div className="form-field-container">
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              id={name}
              name={name}
              checked={formik.values[name]}
              onChange={formik.handleChange}
              onBlur={() => formik.setFieldTouched(name, true)}
              inputProps={{
                "aria-invalid": !!hasError,
                "aria-describedby": hasError ? errorId : undefined,
              }}
            />
          }
          label={label}
        />
      </FormGroup>
      {hasError && (
        <small id={errorId} className="p-error" role="alert">
          {formik.errors[name]}
        </small>
      )}
    </div>
  );
}

export default React.memo(CheckboxWrapper);
