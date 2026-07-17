import { render, screen, fireEvent } from "@testing-library/react";
import { ReplyBar } from "@web/features/chat/ReplyBar";

describe("ReplyBar", () => {
  it("shows the sender name and text content", () => {
    render(
      <ReplyBar
        replyTo={{
          senderName: "Jane Doe",
          senderId: "u1",
          content: "Hello there",
        }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Replying to Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("falls back to senderId when senderName is missing", () => {
    render(
      <ReplyBar
        replyTo={{ senderId: "u1", content: "Hi" }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Replying to u1")).toBeInTheDocument();
  });

  it("falls back to fileName, then 'File', when there is no text content", () => {
    const { rerender } = render(
      <ReplyBar
        replyTo={{ senderId: "u1", fileName: "resume.pdf" }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();

    rerender(<ReplyBar replyTo={{ senderId: "u1" }} onCancel={vi.fn()} />);
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("calls onCancel when the close button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ReplyBar
        replyTo={{ senderId: "u1", content: "Hi" }}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByLabelText("Cancel reply"));
    expect(onCancel).toHaveBeenCalled();
  });
});
