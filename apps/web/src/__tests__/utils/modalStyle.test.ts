import { style } from "@web/shared/utils/modalStyle";

describe("modalStyle", () => {
  it("positions the modal absolutely at 50% center", () => {
    expect(style.position).toBe("absolute");
    expect(style.top).toBe("50%");
    expect(style.left).toBe("50%");
    expect(style.transform).toBe("translate(-50%,-50%)");
  });

  it("has correct dimensions and overflow", () => {
    expect(style.width).toBe(700);
    expect(style.maxHeight).toBe("95%");
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
