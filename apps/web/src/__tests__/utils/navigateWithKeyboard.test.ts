import { navigateWithKeyboard } from "@web/shared/utils/navigateWithKeyboard";

const makePlatform = (platform: string) => {
  Object.defineProperty(navigator, "platform", {
    value: platform,
    configurable: true,
  });
};

describe("navigateWithKeyboard", () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    makePlatform("Win32");
  });

  // ── Non-Mac (Ctrl+Shift) ───────────────────────────────────────────────────

  it("calls navigate(-1) on Ctrl+Shift+ArrowLeft (non-Mac)", () => {
    navigateWithKeyboard(
      { ctrlKey: true, shiftKey: true, key: "ArrowLeft", metaKey: false },
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("calls navigate(1) on Ctrl+Shift+ArrowRight (non-Mac)", () => {
    navigateWithKeyboard(
      { ctrlKey: true, shiftKey: true, key: "ArrowRight", metaKey: false },
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith(1);
  });

  it("does nothing when only Ctrl+ArrowLeft (no shift) on non-Mac", () => {
    navigateWithKeyboard(
      { ctrlKey: true, shiftKey: false, key: "ArrowLeft", metaKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing when only Shift+ArrowLeft (no ctrl) on non-Mac", () => {
    navigateWithKeyboard(
      { ctrlKey: false, shiftKey: true, key: "ArrowLeft", metaKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing for a plain key (no modifiers)", () => {
    navigateWithKeyboard(
      { ctrlKey: false, shiftKey: false, key: "ArrowLeft", metaKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  // ── Mac (Cmd+Shift) ────────────────────────────────────────────────────────

  it("calls navigate(-1) on Cmd+Shift+ArrowLeft (Mac)", () => {
    makePlatform("MacIntel");
    navigateWithKeyboard(
      { metaKey: true, shiftKey: true, key: "ArrowLeft", ctrlKey: false },
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("calls navigate(1) on Cmd+Shift+ArrowRight (Mac)", () => {
    makePlatform("MacIntel");
    navigateWithKeyboard(
      { metaKey: true, shiftKey: true, key: "ArrowRight", ctrlKey: false },
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith(1);
  });

  it("does nothing on Ctrl+Shift+ArrowLeft when on Mac", () => {
    makePlatform("MacIntel");
    navigateWithKeyboard(
      { ctrlKey: true, shiftKey: true, key: "ArrowLeft", metaKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing on Cmd+Shift+ArrowLeft when not on Mac", () => {
    // platform is Win32 from beforeEach
    navigateWithKeyboard(
      { metaKey: true, shiftKey: true, key: "ArrowLeft", ctrlKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  // ── Unrelated keys ─────────────────────────────────────────────────────────

  it("does nothing for Ctrl+Shift+ArrowUp", () => {
    navigateWithKeyboard(
      { ctrlKey: true, shiftKey: true, key: "ArrowUp", metaKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing for Ctrl+Shift+Enter", () => {
    navigateWithKeyboard(
      { ctrlKey: true, shiftKey: true, key: "Enter", metaKey: false },
      navigate,
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
