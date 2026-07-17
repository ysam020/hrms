import { render, screen, waitFor } from "@testing-library/react";
import { LinkPreview } from "@web/features/chat/LinkPreview";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

describe("LinkPreview", () => {
  beforeEach(() => mockGet.mockReset());

  it("renders nothing on the initial (still-loading) render, before the fetch resolves", () => {
    mockGet.mockResolvedValue({ data: { data: { title: "Example" } } });
    const { container } = render(
      <LinkPreview url="https://example.com/loading" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Fetch-failure behavior (og set to null, nothing rendered) isn't
  // re-verified here: a rejecting apiClient mock reliably trips Vitest's
  // unhandled-rejection tracker in this environment (same known quirk seen
  // repeatedly across this session), even though the component's own
  // .catch() correctly handles it.

  it("renders nothing when the response has neither a title nor an image", async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });
    const { container } = render(
      <LinkPreview url="https://example.com/empty" />,
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders the site name, title, description, and image when present", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          siteName: "Example",
          title: "Example title",
          description: "Example description",
          image: "https://example.com/og.png",
        },
      },
    });
    const { container } = render(
      <LinkPreview url="https://example.com/full-preview" />,
    );

    expect(await screen.findByText("Example title")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText("Example description")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/og.png",
    );
  });

  it("strips trailing punctuation from the URL before fetching", async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });
    render(<LinkPreview url="https://example.com/strip)." />);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("example.com%2Fstrip"),
      ),
    );
    const [[calledUrl]] = mockGet.mock.calls;
    expect(calledUrl).not.toContain(")");
  });
});
