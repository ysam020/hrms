import { toggleSpotlightModal } from "@web/core/shortcuts/toggleSpotlightModal";

function makeEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    shiftKey: true,
    key: " ",
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("toggleSpotlightModal", () => {
  it("opens the modal on Shift+Space when a user is present", () => {
    const event = makeEvent();
    const handleOpen = vi.fn();

    toggleSpotlightModal(event, { id: "u1" }, handleOpen);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleOpen).toHaveBeenCalled();
  });

  it("prevents default but does not open when there is no user", () => {
    const event = makeEvent();
    const handleOpen = vi.fn();

    toggleSpotlightModal(event, null, handleOpen);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(handleOpen).not.toHaveBeenCalled();
  });

  it("ignores Space without Shift", () => {
    const event = makeEvent({ shiftKey: false });
    const handleOpen = vi.fn();

    toggleSpotlightModal(event, { id: "u1" }, handleOpen);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handleOpen).not.toHaveBeenCalled();
  });

  it("ignores Shift with a different key", () => {
    const event = makeEvent({ key: "a" });
    const handleOpen = vi.fn();

    toggleSpotlightModal(event, { id: "u1" }, handleOpen);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handleOpen).not.toHaveBeenCalled();
  });
});
