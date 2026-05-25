import { style } from "@web/shared/utils/modalStyle";

describe("modalStyle", () => {
  it("does NOT contain position/transform properties (centering is handled by CustomModal flex container)", () => {
    expect((style as any).position).toBeUndefined();
    expect((style as any).top).toBeUndefined();
    expect((style as any).left).toBeUndefined();
    expect((style as any).transform).toBeUndefined();
  });

  it("has correct dimensions and overflow", () => {
    expect(style.width).toBe(700);
    expect(style.maxHeight).toBe("95%");
    expect(style.overflow).toBe("auto");
  });

  it("has shadow, border radius, and no outline", () => {
    expect(style.boxShadow).toBe(24);
    expect(style.borderRadius).toBe(5);
    expect(style.outline).toBe(0);
  });

  it("uses MUI background.paper token for bgcolor", () => {
    expect(style.bgcolor).toBe("background.paper");
  });

  it("has padding set", () => {
    expect(style.p).toBe(4);
  });
});
