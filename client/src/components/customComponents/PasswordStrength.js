import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Password } from "primereact/password";
import validators from "@hrms/validation-utils";

function PasswordStrength(props) {
  const { passwordStrength } = validators;

  const handlePasswordChange = (e) => {
    props.formik.handleChange(e);
    passwordStrength(e.target.value);
  };

  // Footer for password guidelines
  const passwordFooter = (
    <Box>
      <Typography
        variant="caption"
        sx={{ display: "block", fontSize: "0.75rem", mt: 1 }}
      >
        Requirements:
      </Typography>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.75rem" }}>
        <li>Minimum 8 characters</li>
        <li>At least one uppercase letter</li>
        <li>At least one lowercase letter</li>
        <li>At least one number</li>
        <li>At least one special character</li>
      </ul>
    </Box>
  );

  return (
    <>
      <Password
        toggleMask
        id={props.name}
        name={props.name}
        placeholder={props.placeholder}
        value={props.value}
        onChange={handlePasswordChange}
        feedback={true}
        footer={passwordFooter}
        appendTo={"self"}
      />
    </>
  );
}

export default React.memo(PasswordStrength);
