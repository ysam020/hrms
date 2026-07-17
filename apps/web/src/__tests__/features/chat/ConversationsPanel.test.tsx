import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationsPanel } from "@web/features/chat/ConversationsPanel";

const CONV = {
  _id: "c1",
  participants: ["me", "u2"],
  participantDetails: [{ id: "u2", first_name: "Jane", last_name: "Doe" }],
  lastActivity: new Date().toISOString(),
  lastMessage: { type: "text", content: "Hi" },
};

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof ConversationsPanel>> = {},
) {
  const onStartConversation = vi.fn();
  const onOpenRoom = vi.fn();
  const setUserSearch = vi.fn();
  const view = render(
    <ConversationsPanel
      mobileShowThread={false}
      userSearch=""
      setUserSearch={setUserSearch}
      searching={false}
      searchResults={[]}
      onStartConversation={onStartConversation}
      loadingConversations={false}
      conversations={[]}
      myUserId="me"
      activeRoomId={null}
      onOpenRoom={onOpenRoom}
      unreadCounts={{}}
      {...overrides}
    />,
  );
  return {
    onStartConversation,
    onOpenRoom,
    setUserSearch,
    container: view.container,
  };
}

describe("ConversationsPanel", () => {
  it("shows a loading spinner while conversations load", () => {
    const { container } = renderPanel({ loadingConversations: true });
    expect(
      container.querySelector(".MuiCircularProgress-root"),
    ).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no conversations", () => {
    renderPanel({ conversations: [] });
    expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
  });

  it("renders each conversation as a ConversationItem", () => {
    renderPanel({ conversations: [CONV] });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("calls onOpenRoom when a conversation is clicked", () => {
    const { onOpenRoom } = renderPanel({ conversations: [CONV] });
    fireEvent.click(screen.getByText("Jane Doe"));
    expect(onOpenRoom).toHaveBeenCalledWith(CONV);
  });

  it("shows search results and starts a conversation on click", () => {
    const { onStartConversation } = renderPanel({
      searchResults: [{ username: "jdoe", fullName: "Jane Doe" }],
    });
    expect(
      screen.getByLabelText("Start conversation with Jane Doe"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Jane Doe"));
    expect(onStartConversation).toHaveBeenCalledWith({
      username: "jdoe",
      fullName: "Jane Doe",
    });
  });

  it("falls back to username when fullName is missing in search results", () => {
    renderPanel({ searchResults: [{ username: "jdoe" }] });
    expect(screen.getAllByText("jdoe").length).toBeGreaterThan(0);
  });

  it("calls setUserSearch as the user types", () => {
    const { setUserSearch } = renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Search people…"), {
      target: { value: "jane" },
    });
    expect(setUserSearch).toHaveBeenCalledWith("jane");
  });
});
