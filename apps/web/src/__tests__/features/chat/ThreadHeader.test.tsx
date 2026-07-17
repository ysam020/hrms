import { render, screen, fireEvent } from "@testing-library/react";
import { ThreadHeader } from "@web/features/chat/ThreadHeader";

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof ThreadHeader>> = {},
) {
  const onBack = vi.fn();
  const onDeleteChatClick = vi.fn();
  const setHeaderMenuAnchor = vi.fn();
  render(
    <ThreadHeader
      otherUser="Jane Doe"
      headerMenuAnchor={null}
      setHeaderMenuAnchor={setHeaderMenuAnchor}
      onBack={onBack}
      onDeleteChatClick={onDeleteChatClick}
      {...overrides}
    />,
  );
  return { onBack, onDeleteChatClick, setHeaderMenuAnchor };
}

describe("ThreadHeader", () => {
  it("shows the other user's name", () => {
    renderHeader();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", () => {
    const { onBack } = renderHeader();
    fireEvent.click(screen.getByLabelText("Back to conversations"));
    expect(onBack).toHaveBeenCalled();
  });

  it("opens the options menu, and choosing Delete Chat closes the menu and triggers onDeleteChatClick", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    const { onDeleteChatClick, setHeaderMenuAnchor } = renderHeader({
      headerMenuAnchor: anchorEl,
    });

    fireEvent.click(screen.getByText("Delete Chat"));

    expect(setHeaderMenuAnchor).toHaveBeenCalledWith(null);
    expect(onDeleteChatClick).toHaveBeenCalled();
  });

  it("opens the menu on chat-options click", () => {
    const { setHeaderMenuAnchor } = renderHeader();
    fireEvent.click(screen.getByLabelText("Chat options"));
    expect(setHeaderMenuAnchor).toHaveBeenCalled();
  });
});
