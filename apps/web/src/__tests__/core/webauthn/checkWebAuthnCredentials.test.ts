import { checkWebAuthnCredentials } from "@web/core/webauthn/checkWebAuthnCredentials";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn() },
}));

const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

describe("checkWebAuthnCredentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success + hasCredentials from the server response", async () => {
    mockPost.mockResolvedValue({ data: { hasCredentials: true } });
    const result = await checkWebAuthnCredentials("jdoe");
    expect(result).toEqual({ success: true, hasCredentials: true });
  });

  it("returns the server-provided error message on a failed request", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "User not found" } },
    });
    const result = await checkWebAuthnCredentials("jdoe");
    expect(result).toEqual({
      success: false,
      message: "User not found",
      hasCredentials: false,
    });
  });

  it("falls back to a generic message when the error has no response body", async () => {
    mockPost.mockRejectedValue(new Error("network error"));
    const result = await checkWebAuthnCredentials("jdoe");
    expect(result).toEqual({
      success: false,
      message: "Unable to check credentials",
      hasCredentials: false,
    });
  });
});
