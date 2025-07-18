const validators = {
  // Email validation
  email: () => {
    const emailRegex =
      /[a-zA-Z0-9_]+(\.)?[a-zA-Z0-9_]+[@]{1}[a-zA-Z]+\.[a-zA-Z]{2,6}/;
    return emailRegex;
  },

  // Mobile number validation (Indian format)
  mobileNumber: () => {
    const mobileRegex = /^[6-9]\d{9}$/;
    return mobileRegex;
  },

  // Aadhar number validation
  aadharNumber: () => {
    const aadharRegex = /^\d{12}$/;
    return aadharRegex;
  },

  // PAN number validation
  panNumber: () => {
    const panRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
    return panRegex;
  },

  // Pin code validation
  pinCode: () => {
    const pinCodeRegex = /^\d{6}$/;
    return pinCodeRegex;
  },

  // Time validation (24-hour format)
  time24Hour: () => {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return timeRegex;
  },

  // Date validation (YYYY-MM-DD format)
  dateYMD: () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex;
  },

  // Password strength validation
  passwordStrength: (password) => {
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/;
    const hasLower = /[a-z]/;
    const hasNumber = /\d/;
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/;

    return {
      isValid: minLength && hasUpper && hasLower && hasNumber && hasSpecial,
      score: [minLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(
        Boolean
      ).length,
      requirements: {
        minLength,
        hasUpper,
        hasLower,
        hasNumber,
        hasSpecial,
      },
    };
  },
};

export default validators;
