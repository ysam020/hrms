import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "@web/features/chat/MessageBubble";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }) },
}));

function baseMsg(overrides: Partial<any> = {}) {
  return {
    _id: "m1",
    senderId: "u2",
    type: "text",
    content: "Hello there",
    createdAt: "2024-06-01T10:00:00Z",
    isDeleted: false,
    isPinned: false,
    readBy: [],
    ...overrides,
  };
}

function renderBubble(
  overrides: Partial<React.ComponentProps<typeof MessageBubble>> = {},
) {
  const onReply = vi.fn();
  const onDelete = vi.fn();
  const onPin = vi.fn();
  const onUnpin = vi.fn();
  const onJumpToMessage = vi.fn();
  const onImageClick = vi.fn();
  const view = render(
    <MessageBubble
      msg={baseMsg()}
      isMine={false}
      onReply={onReply}
      onDelete={onDelete}
      onPin={onPin}
      onUnpin={onUnpin}
      onJumpToMessage={onJumpToMessage}
      roomParticipants={["me", "u2"]}
      onImageClick={onImageClick}
      senderName="Jane"
      replyToSenderName=""
      {...overrides}
    />,
  );
  return {
    onReply,
    onDelete,
    onPin,
    onUnpin,
    onJumpToMessage,
    onImageClick,
    container: view.container,
  };
}

describe("MessageBubble", () => {
  it("shows a deleted placeholder and hides all actions for a deleted message", () => {
    renderBubble({ msg: baseMsg({ isDeleted: true }) });
    expect(screen.getByText("🚫 This message was deleted")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reply to message")).not.toBeInTheDocument();
  });

  it("renders text content with a reply and more-options action", () => {
    renderBubble();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply to message")).toBeInTheDocument();
    expect(screen.getByLabelText("More message options")).toBeInTheDocument();
  });

  it("renders an image message and forwards clicks to onImageClick", () => {
    const { onImageClick } = renderBubble({
      msg: baseMsg({
        type: "image",
        fileUrl: "https://x/img.png",
        fileName: "img.png",
      }),
    });
    const img = screen.getByAltText("img.png");
    fireEvent.click(img);
    expect(onImageClick).toHaveBeenCalledWith("https://x/img.png");
  });

  it("renders a video message with a filename caption", () => {
    renderBubble({
      msg: baseMsg({
        type: "video",
        fileUrl: "https://x/v.mp4",
        fileName: "clip.mp4",
      }),
    });
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  });

  it("renders a file message with name and formatted size", () => {
    renderBubble({
      msg: baseMsg({
        type: "file",
        fileUrl: "https://x/doc.pdf",
        fileName: "doc.pdf",
        fileMimeType: "application/pdf",
        fileSize: 2048,
      }),
    });
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("shows a reply preview when the message replies to another", () => {
    renderBubble({
      msg: baseMsg({ replyTo: { _id: "m0", content: "Original" } }),
      replyToSenderName: "John",
    });
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("shows a deleted-original notice in the reply preview when the replied-to message was deleted", () => {
    renderBubble({
      msg: baseMsg({ replyTo: { _id: "m0", isDeleted: true } }),
      replyToSenderName: "John",
    });
    expect(screen.getByText("🚫 Original message deleted")).toBeInTheDocument();
  });

  it("jumps to the original message when the reply preview is clicked", () => {
    const { onJumpToMessage } = renderBubble({
      msg: baseMsg({ replyTo: { _id: "m0", content: "Original" } }),
      replyToSenderName: "John",
    });
    fireEvent.click(screen.getByText("Original"));
    expect(onJumpToMessage).toHaveBeenCalledWith("m0");
  });

  it("calls onReply when the reply action is clicked", () => {
    const { onReply } = renderBubble();
    fireEvent.click(screen.getByLabelText("Reply to message"));
    expect(onReply).toHaveBeenCalled();
  });

  it("opens the options menu and pins an unpinned message", () => {
    const { onPin } = renderBubble();
    fireEvent.click(screen.getByLabelText("More message options"));
    fireEvent.click(screen.getByText("Pin message"));
    expect(onPin).toHaveBeenCalled();
  });

  it("offers Unpin (not Pin) for an already-pinned message", () => {
    const { onUnpin } = renderBubble({ msg: baseMsg({ isPinned: true }) });
    fireEvent.click(screen.getByLabelText("More message options"));
    fireEvent.click(screen.getByText("Unpin message"));
    expect(onUnpin).toHaveBeenCalled();
  });

  it("calls onDelete from the options menu", () => {
    const { onDelete } = renderBubble();
    fireEvent.click(screen.getByLabelText("More message options"));
    fireEvent.click(screen.getByText("Delete message"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("does not show a read receipt for someone else's message", () => {
    const { container } = renderBubble({ isMine: false });
    expect(
      container.querySelector('[data-testid="DoneIcon"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="DoneAllIcon"]'),
    ).not.toBeInTheDocument();
  });

  it("shows a single-check receipt for my unread message", async () => {
    renderBubble({
      isMine: true,
      msg: baseMsg({ senderId: "me", readBy: [] }),
    });
    expect(await screen.findByTestId("DoneIcon")).toBeInTheDocument();
  });

  it("shows a double-check receipt once another participant has read it", async () => {
    renderBubble({
      isMine: true,
      msg: baseMsg({ senderId: "me", readBy: ["u2"] }),
      roomParticipants: ["me", "u2"],
    });
    expect(await screen.findByTestId("DoneAllIcon")).toBeInTheDocument();
  });
});
