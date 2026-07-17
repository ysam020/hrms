import { toggleFullScreen } from "@web/core/shortcuts/toggleFullScreen";
import { toggleSidebar } from "@web/core/shortcuts/toggleSidebar";
import { toggleSpotlightModal } from "@web/core/shortcuts/toggleSpotlightModal";

describe("toggleFullScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
  });

  it("requests fullscreen when not currently fullscreen", () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
    const requestFullscreen = vi.fn();
    document.documentElement.requestFullscreen = requestFullscreen;

    toggleFullScreen();

    expect(requestFullscreen).toHaveBeenCalled();
  });

  it("exits fullscreen when currently fullscreen", () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
    });
    const exitFullscreen = vi.fn();
    document.exitFullscreen = exitFullscreen;

    toggleFullScreen();

    expect(exitFullscreen).toHaveBeenCalled();
  });

  it("falls back to the webkit-prefixed API when the standard one is unavailable", () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
    const el = document.documentElement as any;
    delete el.requestFullscreen;
    const webkitRequestFullscreen = vi.fn();
    el.webkitRequestFullscreen = webkitRequestFullscreen;

    toggleFullScreen();

    expect(webkitRequestFullscreen).toHaveBeenCalled();
    delete el.webkitRequestFullscreen;
  });
});

describe("toggleSidebar", () => {
  it("toggles the sidebar on Ctrl+Shift+S", () => {
    const setShowSidebar = vi.fn();
    const event = {
      ctrlKey: true,
      shiftKey: true,
      key: "s",
      preventDefault: vi.fn(),
    } as any;

    toggleSidebar(event, setShowSidebar);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(setShowSidebar).toHaveBeenCalledWith(expect.any(Function));
    expect(setShowSidebar.mock.calls[0][0](true)).toBe(false);
  });

  it("also accepts Cmd (metaKey) + Shift + S", () => {
    const setShowSidebar = vi.fn();
    const event = {
      metaKey: true,
      shiftKey: true,
      key: "s",
      preventDefault: vi.fn(),
    } as any;

    toggleSidebar(event, setShowSidebar);

    expect(setShowSidebar).toHaveBeenCalled();
  });

  it("does nothing when Shift is not held", () => {
    const setShowSidebar = vi.fn();
    const event = {
      ctrlKey: true,
      shiftKey: false,
      key: "s",
      preventDefault: vi.fn(),
    } as any;

    toggleSidebar(event, setShowSidebar);

    expect(setShowSidebar).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing for an unrelated key", () => {
    const setShowSidebar = vi.fn();
    const event = {
      ctrlKey: true,
      shiftKey: true,
      key: "a",
      preventDefault: vi.fn(),
    } as any;

    toggleSidebar(event, setShowSidebar);

    expect(setShowSidebar).not.toHaveBeenCalled();
  });
});

describe("toggleSpotlightModal", () => {
  it("opens the spotlight modal on Shift+Space when a user is present", () => {
    const handleOpen = vi.fn();
    const event = { shiftKey: true, key: " ", preventDefault: vi.fn() } as any;

    toggleSpotlightModal(event, { id: "u1" }, handleOpen);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleOpen).toHaveBeenCalled();
  });

  it("prevents default but does not open when there is no user (not logged in)", () => {
    const handleOpen = vi.fn();
    const event = { shiftKey: true, key: " ", preventDefault: vi.fn() } as any;

    toggleSpotlightModal(event, null, handleOpen);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleOpen).not.toHaveBeenCalled();
  });

  it("does nothing for an unrelated key combination", () => {
    const handleOpen = vi.fn();
    const event = { shiftKey: false, key: " ", preventDefault: vi.fn() } as any;

    toggleSpotlightModal(event, { id: "u1" }, handleOpen);

    expect(handleOpen).not.toHaveBeenCalled();
  });
});
