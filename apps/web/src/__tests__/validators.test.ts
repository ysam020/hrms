import validators from "@web/shared/validators";

describe("validators.email", () => {
  const regex = validators.email();

  it("matches valid email", () => {
    expect(regex.test("user@example.com")).toBe(true);
    expect(regex.test("user.name@domain.co")).toBe(true);
    expect(regex.test("user_name@sub.domain.org")).toBe(true);
  });

  it("does not match invalid email", () => {
    expect(regex.test("not-an-email")).toBe(false);
    expect(regex.test("@nodomain.com")).toBe(false);
    expect(regex.test("user@")).toBe(false);
  });
});

describe("validators.mobileNumber", () => {
  const regex = validators.mobileNumber();

  it("matches valid Indian mobile numbers", () => {
    expect(regex.test("9876543210")).toBe(true);
    expect(regex.test("6000000000")).toBe(true);
    expect(regex.test("8123456789")).toBe(true);
  });

  it("rejects numbers not starting with 6-9", () => {
    expect(regex.test("5876543210")).toBe(false);
    expect(regex.test("1234567890")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(regex.test("987654321")).toBe(false);
    expect(regex.test("98765432101")).toBe(false);
  });
});

describe("validators.aadharNumber", () => {
  const regex = validators.aadharNumber();

  it("matches exactly 12 digits", () => {
    expect(regex.test("123456789012")).toBe(true);
    expect(regex.test("000000000000")).toBe(true);
  });

  it("rejects non-12-digit strings", () => {
    expect(regex.test("12345678901")).toBe(false);
    expect(regex.test("1234567890123")).toBe(false);
    expect(regex.test("12345678901a")).toBe(false);
  });
});

describe("validators.panNumber", () => {
  const regex = validators.panNumber();

  it("matches valid PAN format AAAAA0000A", () => {
    expect(regex.test("ABCDE1234F")).toBe(true);
    expect(regex.test("ZZZZZ9999Z")).toBe(true);
  });

  it("rejects invalid PAN", () => {
    expect(regex.test("abcde1234f")).toBe(false); // lowercase
    expect(regex.test("ABCD12345F")).toBe(false); // 4 letters + 5 digits
    expect(regex.test("ABCDE1234")).toBe(false); // missing trailing letter
  });
});

describe("validators.pinCode", () => {
  const regex = validators.pinCode();

  it("matches exactly 6 digits", () => {
    expect(regex.test("110001")).toBe(true);
    expect(regex.test("000000")).toBe(true);
  });

  it("rejects invalid pin codes", () => {
    expect(regex.test("11000")).toBe(false);
    expect(regex.test("1100011")).toBe(false);
    expect(regex.test("11000a")).toBe(false);
  });
});

describe("validators.time24Hour", () => {
  const regex = validators.time24Hour();

  it("matches valid 24-hour times", () => {
    expect(regex.test("00:00")).toBe(true);
    expect(regex.test("09:30")).toBe(true);
    expect(regex.test("23:59")).toBe(true);
    expect(regex.test("12:00")).toBe(true);
  });

  it("rejects invalid times", () => {
    expect(regex.test("24:00")).toBe(false);
    expect(regex.test("9:30")).toBe(false); // single digit hour
    expect(regex.test("12:60")).toBe(false);
    expect(regex.test("12:5")).toBe(false);
  });
});

describe("validators.dateYMD", () => {
  const regex = validators.dateYMD();

  it("matches YYYY-MM-DD format", () => {
    expect(regex.test("2024-03-15")).toBe(true);
    expect(regex.test("2000-01-01")).toBe(true);
  });

  it("rejects invalid date formats", () => {
    expect(regex.test("15-03-2024")).toBe(false);
    expect(regex.test("2024/03/15")).toBe(false);
    expect(regex.test("2024-3-5")).toBe(false);
  });
});

describe("validators.passwordStrength", () => {
  it("returns isValid truthy for password >= 8 chars (due to known bug: regex objects are truthy)", () => {
    // BUG: hasUpper/hasLower/hasNumber/hasSpecial are RegExp objects (always truthy).
    // isValid = minLength && regExp && regExp && regExp && regExp → last RegExp (truthy, not true)
    const result = validators.passwordStrength("abcdefgh");
    expect(result.isValid).toBeTruthy();
  });

  it("returns isValid=false for password < 8 chars", () => {
    const result = validators.passwordStrength("abc");
    expect(result.isValid).toBe(false);
  });

  it("score includes minLength=true for long password", () => {
    const result = validators.passwordStrength("longenoughpassword");
    expect(result.requirements.minLength).toBe(true);
    // score is always 5 for length >= 8 due to truthy regex objects
    expect(result.score).toBe(5);
  });

  it("score reflects minLength=false for short password", () => {
    const result = validators.passwordStrength("ab");
    expect(result.requirements.minLength).toBe(false);
    // minLength=false, all 4 regex objects truthy → score = 4
    expect(result.score).toBe(4);
  });

  it("requirements object has all 5 keys", () => {
    const result = validators.passwordStrength("Test1234!");
    expect(result.requirements).toHaveProperty("minLength");
    expect(result.requirements).toHaveProperty("hasUpper");
    expect(result.requirements).toHaveProperty("hasLower");
    expect(result.requirements).toHaveProperty("hasNumber");
    expect(result.requirements).toHaveProperty("hasSpecial");
  });
});
