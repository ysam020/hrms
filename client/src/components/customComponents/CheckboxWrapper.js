import React from "react";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

function CheckboxWrapper({ name, label, formik }) {
  const hasError = formik.touched[name] && formik.errors[name];

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
            />
          }
          label={label}
        />
      </FormGroup>
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
}

export default React.memo(CheckboxWrapper);
