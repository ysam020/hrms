import { render, screen, fireEvent } from "@testing-library/react";
import { PinnedMessagesBar } from "@web/features/chat/PinnedMessagesBar";

const PINNED = [
  { _id: "m1", senderId: "u1", content: "First pinned" },
  { _id: "m2", senderId: "u2", content: "Second pinned" },
];

function renderBar(
  overrides: Partial<React.ComponentProps<typeof PinnedMessagesBar>> = {},
) {
  const setPinnedBarExpanded = vi.fn();
  const onJumpToMessage = vi.fn();
  const onUnpinMessage = vi.fn();
  render(
    <PinnedMessagesBar
      activePinnedMessages={PINNED}
      pinnedBarExpanded={false}
      setPinnedBarExpanded={setPinnedBarExpanded}
      resolveParticipantName={(id) => (id === "u1" ? "Jane" : "John")}
      onJumpToMessage={onJumpToMessage}
      onUnpinMessage={onUnpinMessage}
      {...overrides}
    />,
  );
  return { setPinnedBarExpanded, onJumpToMessage, onUnpinMessage };
}

describe("PinnedMessagesBar", () => {
  it("shows the plural count and only the first message when collapsed", () => {
    renderBar({ pinnedBarExpanded: false });
    expect(screen.getByText("2 Pinned Messages")).toBeInTheDocument();
    expect(screen.getByText("First pinned")).toBeInTheDocument();
    expect(screen.queryByText("Second pinned")).not.toBeInTheDocument();
  });

  it("shows the singular count for exactly one pinned message", () => {
    renderBar({ activePinnedMessages: [PINNED[0]] });
    expect(screen.getByText("1 Pinned Message")).toBeInTheDocument();
  });

  it("shows all pinned messages when expanded", () => {
    renderBar({ pinnedBarExpanded: true });
    expect(screen.getByText("First pinned")).toBeInTheDocument();
    expect(screen.getByText("Second pinned")).toBeInTheDocument();
  });

  it("toggles expansion on header click and Enter/Space", () => {
    const { setPinnedBarExpanded } = renderBar();
    fireEvent.click(screen.getByText("2 Pinned Messages"));
    expect(setPinnedBarExpanded).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(
      screen.getByText("2 Pinned Messages").closest('[role="button"]')!,
      {
        key: "Enter",
      },
    );
    expect(setPinnedBarExpanded).toHaveBeenCalledTimes(2);
  });

  it("calls onJumpToMessage when a pinned item is clicked", () => {
    const { onJumpToMessage } = renderBar({ pinnedBarExpanded: true });
    fireEvent.click(screen.getByText("First pinned"));
    expect(onJumpToMessage).toHaveBeenCalledWith("m1");
  });

  it("calls onUnpinMessage without triggering the jump handler", () => {
    const { onJumpToMessage, onUnpinMessage } = renderBar({
      pinnedBarExpanded: true,
    });
    fireEvent.click(screen.getAllByLabelText("Unpin message")[0]);
    expect(onUnpinMessage).toHaveBeenCalledWith(PINNED[0]);
    expect(onJumpToMessage).not.toHaveBeenCalled();
  });

  it("resolves each pinned message's sender name", () => {
    renderBar({ pinnedBarExpanded: true });
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("John")).toBeInTheDocument();
  });
});
