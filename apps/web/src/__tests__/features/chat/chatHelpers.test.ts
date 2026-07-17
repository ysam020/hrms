import {
  getOtherParticipant,
  formatTime,
  formatDateSeparator,
  formatConvTime,
  formatFileSize,
  getMessageType,
  flashMessage,
  FIRST_URL_RE,
} from "@web/features/chat/chatHelpers";

describe("getOtherParticipant", () => {
  it("returns 'Unknown' when there is no other participant in the room", () => {
    expect(getOtherParticipant({ participants: ["me"] }, "me")).toBe("Unknown");
  });

  it("formats the other participant's full name when available", () => {
    const room = {
      participants: ["me", "other1"],
      participantDetails: [
        { id: "other1", first_name: "Jane", last_name: "Doe" },
      ],
    };
    expect(getOtherParticipant(room, "me")).toBe("Jane Doe");
  });

  it("falls back to username when first/last name are both missing but username exists", () => {
    const room = {
      participants: ["me", "other1"],
      participantDetails: [{ id: "other1", username: "jdoe" }],
    };
    expect(getOtherParticipant(room, "me")).toBe("jdoe");
  });

  it("returns 'Unknown User' when the other participant has no matching detail record", () => {
    const room = { participants: ["me", "other1"], participantDetails: [] };
    expect(getOtherParticipant(room, "me")).toBe("Unknown User");
  });

  it("matches participant details by _id as well as id", () => {
    const room = {
      participants: ["me", "other1"],
      participantDetails: [{ _id: "other1", first_name: "Jane" }],
    };
    expect(getOtherParticipant(room, "me")).toBe("Jane");
  });
});

describe("formatTime", () => {
  it("returns an empty string for a falsy date", () => {
    expect(formatTime(undefined)).toBe("");
  });

  it("formats a date string to a localized time", () => {
    expect(formatTime("2024-01-01T10:30:00Z")).toEqual(expect.any(String));
  });
});

describe("formatDateSeparator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns an empty string for a falsy date", () => {
    expect(formatDateSeparator(undefined)).toBe("");
  });

  it("returns 'Today' for the current date", () => {
    expect(formatDateSeparator("2024-06-15T08:00:00")).toBe("Today");
  });

  it("returns 'Yesterday' for the previous day", () => {
    expect(formatDateSeparator("2024-06-14T08:00:00")).toBe("Yesterday");
  });

  it("returns a formatted date for anything older", () => {
    expect(formatDateSeparator("2024-06-01T08:00:00")).toEqual(
      expect.stringContaining("June"),
    );
  });
});

describe("formatConvTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns an empty string for a falsy date", () => {
    expect(formatConvTime(undefined)).toBe("");
  });

  it("returns just the time for a message from today", () => {
    expect(formatConvTime("2024-06-15T09:00:00")).toEqual(expect.any(String));
    expect(formatConvTime("2024-06-15T09:00:00")).not.toBe("Yesterday");
  });

  it("returns 'Yesterday' for a message from exactly one day ago", () => {
    expect(formatConvTime("2024-06-14T12:00:00")).toBe("Yesterday");
  });

  it("returns a weekday name for a message within the last week", () => {
    expect(formatConvTime("2024-06-11T12:00:00")).toEqual(expect.any(String));
  });

  it("returns a short date for a message older than a week", () => {
    const result = formatConvTime("2024-05-01T12:00:00");
    expect(result).toEqual(expect.any(String));
  });
});

describe("formatFileSize", () => {
  it("returns an empty string for a falsy size", () => {
    expect(formatFileSize(0)).toBe("");
  });

  it("formats bytes under 1KB as B", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats sizes under 1MB as KB", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats sizes at or above 1MB as MB", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getMessageType", () => {
  it("returns 'file' for a falsy mime type", () => {
    expect(getMessageType(undefined)).toBe("file");
  });

  it("classifies image mime types", () => {
    expect(getMessageType("image/png")).toBe("image");
  });

  it("classifies video mime types", () => {
    expect(getMessageType("video/mp4")).toBe("video");
  });

  it("classifies everything else as 'file'", () => {
    expect(getMessageType("application/pdf")).toBe("file");
  });
});

describe("FIRST_URL_RE", () => {
  it("matches the first http(s) URL in a string", () => {
    const match = "check https://example.com/path out".match(FIRST_URL_RE);
    expect(match?.[0]).toBe("https://example.com/path");
  });

  it("does not match plain text with no URL", () => {
    expect("no links here").not.toMatch(FIRST_URL_RE);
  });
});

describe("flashMessage", () => {
  it("returns false when no messageId is given", () => {
    expect(flashMessage(undefined)).toBe(false);
  });

  it("returns false when the element isn't rendered in the DOM", () => {
    expect(flashMessage("does-not-exist")).toBe(false);
  });

  it("scrolls to and highlights the message element, then returns true", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    el.id = "chat-msg-m1";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const found = flashMessage("m1");

    expect(found).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(el.classList.contains("chat-msg-highlight")).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(el.classList.contains("chat-msg-highlight")).toBe(false);

    document.body.removeChild(el);
    vi.useRealTimers();
  });
});
