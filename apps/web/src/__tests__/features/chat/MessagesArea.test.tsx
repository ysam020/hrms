import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MessagesArea } from "@web/features/chat/MessagesArea";

vi.mock("@web/features/chat/MessageBubble", () => ({
  MessageBubble: ({ msg }: any) => <div data-testid="bubble">{msg._id}</div>,
}));

function renderArea(
  overrides: Partial<React.ComponentProps<typeof MessagesArea>> = {},
) {
  render(
    <MessagesArea
      isDark={false}
      loadingMessages={false}
      activeMessages={[]}
      activeTypingUsers={[]}
      resolveParticipantName={() => "Jane"}
      currentUserId="me"
      onScroll={vi.fn()}
      onReply={vi.fn()}
      onDelete={vi.fn()}
      onPin={vi.fn()}
      onUnpin={vi.fn()}
      onJumpToMessage={vi.fn()}
      activeRoomParticipants={[]}
      onImageClick={vi.fn()}
      messagesEndRef={createRef()}
      {...overrides}
    />,
  );
}

function msg(id: string, createdAt: string) {
  return { _id: id, senderId: "u2", type: "text", content: id, createdAt };
}

describe("MessagesArea", () => {
  it("shows a loading spinner while loadingMessages is true", () => {
    const { container } = render(
      <MessagesArea
        isDark={false}
        loadingMessages={true}
        activeMessages={[]}
        activeTypingUsers={[]}
        resolveParticipantName={() => "Jane"}
        currentUserId="me"
        onScroll={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onJumpToMessage={vi.fn()}
        activeRoomParticipants={[]}
        onImageClick={vi.fn()}
        messagesEndRef={createRef()}
      />,
    );
    expect(
      container.querySelector(".MuiCircularProgress-root"),
    ).toBeInTheDocument();
  });

  it("shows the empty state only once loading has finished with no messages", () => {
    renderArea({ activeMessages: [], loadingMessages: false });
    expect(screen.getByText("No messages yet. Say hello!")).toBeInTheDocument();
  });

  it("does not show the empty state while still loading", () => {
    renderArea({ activeMessages: [], loadingMessages: true });
    expect(
      screen.queryByText("No messages yet. Say hello!"),
    ).not.toBeInTheDocument();
  });

  it("renders a date separator once per calendar day, not per message", () => {
    const { container } = render(
      <MessagesArea
        isDark={false}
        loadingMessages={false}
        activeMessages={[
          msg("m1", "2024-06-01T09:00:00Z"),
          msg("m2", "2024-06-01T10:00:00Z"),
          msg("m3", "2024-06-02T09:00:00Z"),
        ]}
        activeTypingUsers={[]}
        resolveParticipantName={() => "Jane"}
        currentUserId="me"
        onScroll={vi.fn()}
        onReply={vi.fn()}
        onDelete={vi.fn()}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onJumpToMessage={vi.fn()}
        activeRoomParticipants={[]}
        onImageClick={vi.fn()}
        messagesEndRef={createRef()}
      />,
    );
    expect(screen.getAllByTestId("bubble")).toHaveLength(3);
    expect(container.querySelectorAll(".chat-date-separator")).toHaveLength(2);
  });

  it("renders one MessageBubble per message", () => {
    renderArea({
      activeMessages: [
        msg("m1", "2024-06-01T09:00:00Z"),
        msg("m2", "2024-06-01T10:00:00Z"),
      ],
    });
    expect(screen.getAllByTestId("bubble").map((el) => el.textContent)).toEqual(
      ["m1", "m2"],
    );
  });

  it("shows the typing indicator when someone is typing", () => {
    renderArea({ activeTypingUsers: ["Jane"] });
    expect(screen.getByText("Jane is typing…")).toBeInTheDocument();
  });

  it("hides the typing indicator when no one is typing", () => {
    renderArea({ activeTypingUsers: [] });
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });
});
