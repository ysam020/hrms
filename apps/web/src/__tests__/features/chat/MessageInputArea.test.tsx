import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { MessageInputArea } from "@web/features/chat/MessageInputArea";

vi.mock("emoji-picker-react", () => ({
  default: ({ onEmojiClick }: any) => (
    <button onClick={() => onEmojiClick({ emoji: "😀" })}>Pick emoji</button>
  ),
  EmojiStyle: { NATIVE: "native" },
}));

function renderInput(
  overrides: Partial<React.ComponentProps<typeof MessageInputArea>> = {},
) {
  const onSend = vi.fn();
  const onTextChange = vi.fn();
  const onFileSelect = vi.fn();
  const setShowEmojiPicker = vi.fn();
  const onEmojiClick = vi.fn();
  render(
    <MessageInputArea
      isDark={false}
      fileInputRef={createRef()}
      uploading={false}
      onFileSelect={onFileSelect}
      showEmojiPicker={false}
      setShowEmojiPicker={setShowEmojiPicker}
      emojiPickerRef={createRef()}
      onEmojiClick={onEmojiClick}
      text=""
      onTextChange={onTextChange}
      onKeyDown={vi.fn()}
      onSend={onSend}
      {...overrides}
    />,
  );
  return {
    onSend,
    onTextChange,
    onFileSelect,
    setShowEmojiPicker,
    onEmojiClick,
  };
}

describe("MessageInputArea", () => {
  it("disables Send when there is no text and nothing is uploading", () => {
    renderInput({ text: "" });
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("enables Send once there is non-whitespace text", () => {
    renderInput({ text: "Hello" });
    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
  });

  it("keeps Send enabled while uploading even with empty text", () => {
    renderInput({ text: "", uploading: true });
    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
  });

  it("calls onSend when Send is clicked", () => {
    const { onSend } = renderInput({ text: "Hi" });
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(onSend).toHaveBeenCalled();
  });

  it("disables the attach button while uploading", () => {
    renderInput({ uploading: true });
    expect(screen.getByRole("button", { name: "Attach file" })).toBeDisabled();
  });

  it("toggles the emoji picker and reflects open state via aria-label/aria-expanded", () => {
    const { setShowEmojiPicker } = renderInput({ showEmojiPicker: false });
    expect(screen.getByLabelText("Open emoji picker")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByLabelText("Open emoji picker"));
    expect(setShowEmojiPicker).toHaveBeenCalled();
  });

  it("shows the emoji picker panel and forwards emoji selection when open", () => {
    const { onEmojiClick } = renderInput({ showEmojiPicker: true });
    expect(screen.getByLabelText("Close emoji picker")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.click(screen.getByText("Pick emoji"));
    expect(onEmojiClick).toHaveBeenCalledWith({ emoji: "😀" });
  });

  it("calls onTextChange as the user types", () => {
    const { onTextChange } = renderInput();
    fireEvent.change(screen.getByPlaceholderText(/Type a message/), {
      target: { value: "Hey" },
    });
    expect(onTextChange).toHaveBeenCalled();
  });
});
