import { render, screen } from "@testing-library/react";
import { TypingIndicator } from "@web/features/chat/TypingIndicator";

describe("TypingIndicator", () => {
  it("renders nothing when there are no typing users", () => {
    const { container } = render(<TypingIndicator names={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when names is undefined", () => {
    const { container } = render(<TypingIndicator names={undefined as any} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a singular message for one typing user", () => {
    render(<TypingIndicator names={["Jane"]} />);
    expect(screen.getByText("Jane is typing…")).toBeInTheDocument();
  });

  it("shows a plural message for multiple typing users", () => {
    render(<TypingIndicator names={["Jane", "John"]} />);
    expect(screen.getByText("Jane, John are typing…")).toBeInTheDocument();
  });
});
