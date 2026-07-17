import { render, screen, fireEvent } from "@testing-library/react";
import {
  ImageLightboxDialog,
  DeleteMessageDialog,
  DeleteConversationDialog,
} from "@web/features/chat/ChatDialogs";

describe("ImageLightboxDialog", () => {
  it("is closed when lightboxUrl is null", () => {
    render(<ImageLightboxDialog lightboxUrl={null} onClose={vi.fn()} />);
    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
  });

  it("shows the image and calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <ImageLightboxDialog
        lightboxUrl="https://example.com/x.png"
        onClose={onClose}
      />,
    );
    expect(screen.getByAltText("Preview")).toHaveAttribute(
      "src",
      "https://example.com/x.png",
    );
    fireEvent.click(screen.getByLabelText("Close image preview"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("DeleteMessageDialog", () => {
  it("calls onCancel and onConfirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteMessageDialog
        open={true}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("Delete Message")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("DeleteConversationDialog", () => {
  it("calls onCancel and onConfirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteConversationDialog
        open={true}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("Delete Chat")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalled();
  });
});
