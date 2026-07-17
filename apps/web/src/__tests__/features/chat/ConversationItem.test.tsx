import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationItem } from "@web/features/chat/ConversationItem";

function makeConv(overrides: Partial<any> = {}) {
  return {
    _id: "c1",
    participants: ["me", "u2"],
    participantDetails: [
      { id: "u2", first_name: "Jane", last_name: "Doe", username: "jdoe" },
    ],
    lastActivity: new Date().toISOString(),
    lastMessage: null,
    ...overrides,
  };
}

describe("ConversationItem", () => {
  it("shows 'Start a conversation' when there is no last message", () => {
    render(
      <ConversationItem
        conv={makeConv()}
        myUserId="me"
        isActive={false}
        onClick={vi.fn()}
        unread={0}
      />,
    );
    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
  });

  it("shows the deleted-message placeholder", () => {
    render(
      <ConversationItem
        conv={makeConv({ lastMessage: { isDeleted: true } })}
        myUserId="me"
        isActive={false}
        onClick={vi.fn()}
        unread={0}
      />,
    );
    expect(screen.getByText("🚫 Message deleted")).toBeInTheDocument();
  });

  it.each([
    [{ type: "text", content: "Hello" }, "Hello"],
    [{ type: "image" }, "📷 Image"],
    [{ type: "video" }, "🎥 Video"],
    [{ type: "file", fileName: "resume.pdf" }, "📎 resume.pdf"],
    [{ type: "file" }, "📎 File"],
  ])("previews a %o message as %s", (lastMessage, expected) => {
    render(
      <ConversationItem
        conv={makeConv({ lastMessage })}
        myUserId="me"
        isActive={false}
        onClick={vi.fn()}
        unread={0}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows the unread badge and pluralizes the aria-label for more than one unread", () => {
    render(
      <ConversationItem
        conv={makeConv()}
        myUserId="me"
        isActive={false}
        onClick={vi.fn()}
        unread={3}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Jane Doe, 3 unread messages"),
    ).toBeInTheDocument();
  });

  it("uses singular wording for exactly one unread", () => {
    render(
      <ConversationItem
        conv={makeConv()}
        myUserId="me"
        isActive={false}
        onClick={vi.fn()}
        unread={1}
      />,
    );
    expect(
      screen.getByLabelText("Jane Doe, 1 unread message"),
    ).toBeInTheDocument();
  });

  it("calls onClick with the conversation on click and on Enter/Space", () => {
    const onClick = vi.fn();
    const conv = makeConv();
    render(
      <ConversationItem
        conv={conv}
        myUserId="me"
        isActive={false}
        onClick={onClick}
        unread={0}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith(conv);

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("marks the active conversation with aria-current", () => {
    render(
      <ConversationItem
        conv={makeConv()}
        myUserId="me"
        isActive={true}
        onClick={vi.fn()}
        unread={0}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-current", "true");
  });
});
