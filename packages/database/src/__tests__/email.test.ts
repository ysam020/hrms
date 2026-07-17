import { canonicalizeEmail, getEmailDomain } from "../email";

describe("canonicalizeEmail", () => {
  it("lowercases and trims the address", () => {
    expect(canonicalizeEmail("  Jane.Doe@Example.com  ")).toBe(
      "jane.doe@example.com",
    );
  });

  it("strips dots from the local part for gmail.com", () => {
    expect(canonicalizeEmail("sameer.y020@gmail.com")).toBe(
      "sameery020@gmail.com",
    );
    expect(canonicalizeEmail("sameery020@gmail.com")).toBe(
      "sameery020@gmail.com",
    );
  });

  it("strips dots from the local part for googlemail.com but keeps the domain as-is", () => {
    expect(canonicalizeEmail("jane.doe@googlemail.com")).toBe(
      "janedoe@gmail.com",
    );
  });

  it("does not strip dots for non-Gmail domains", () => {
    expect(canonicalizeEmail("jane.doe@outlook.com")).toBe(
      "jane.doe@outlook.com",
    );
  });

  it("returns the trimmed/lowercased string unchanged when there is no @ sign", () => {
    expect(canonicalizeEmail("  NotAnEmail  ")).toBe("notanemail");
  });

  it("treats only the last @ as the separator (defensive against malformed input)", () => {
    expect(canonicalizeEmail("weird@local@gmail.com")).toBe(
      "weird@local@gmail.com",
    );
  });
});

describe("getEmailDomain", () => {
  it("returns the domain portion after the last @", () => {
    expect(getEmailDomain("jane@example.com")).toBe("example.com");
  });

  it("returns an empty string when there is no @ sign", () => {
    expect(getEmailDomain("notanemail")).toBe("");
  });

  it("uses the last @ for a malformed multi-@ address", () => {
    expect(getEmailDomain("a@b@example.com")).toBe("example.com");
  });
});
