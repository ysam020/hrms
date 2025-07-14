import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Password } from "primereact/password";

function PasswordStrength(props) {
  const evaluatePasswordStrength = (password) => {
    // Initialize score
    let score = 0;

    if (!password) {
      props.setPasswordScore(0);
      props.setStrengthLabel("");
      return;
    }

    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;

    // Complexity checks
    if (/[A-Z]/.test(password)) score += 1; // Has uppercase
    if (/[a-z]/.test(password)) score += 1; // Has lowercase
    if (/\d/.test(password)) score += 1; // Has number
    if (/[^A-Za-z0-9]/.test(password)) score += 1; // Has special char

    // Convert score to a 0-100 scale
    const normalizedScore = Math.min(Math.floor((score / 6) * 100), 100);
    props.setPasswordScore(normalizedScore);

    // Set label based on score
    if (normalizedScore < 20) props.setStrengthLabel("Very Weak");
    else if (normalizedScore < 40) props.setStrengthLabel("Weak");
    else if (normalizedScore < 60) props.setStrengthLabel("Fair");
    else if (normalizedScore < 80) props.setStrengthLabel("Good");
    else props.setStrengthLabel("Strong");
  };

  const handlePasswordChange = (e) => {
    props.formik.handleChange(e);
    evaluatePasswordStrength(e.target.value);
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
