import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResignationForm from "@web/features/resignation/ResignationForm";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function renderWith(setAlert = vi.fn(), onSuccess = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ResignationForm onSuccess={onSuccess} />
    </AlertContext.Provider>,
  );
  return { setAlert, onSuccess };
}

const PLACEHOLDER =
  "Please provide your reason for resignation (minimum 10 characters)";

describe("ResignationForm", () => {
  beforeEach(() => mockPost.mockReset());

  it("shows a live character counter for the reason field", () => {
    renderWith();
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "Family" },
    });
    expect(screen.getByText("6 characters (10 minimum)")).toBeInTheDocument();
  });

  it("blocks submission with a reason shorter than 10 characters", async () => {
    renderWith();
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "too short" },
    });
    fireEvent.click(screen.getByText("Submit Resignation"));

    expect(
      await screen.findByText(
        "Please provide a more detailed reason (at least 10 characters)",
      ),
    ).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("submits a valid resignation, shows a success alert, resets the form, and calls onSuccess", async () => {
    mockPost.mockResolvedValue({ data: { message: "Resignation submitted" } });
    const { setAlert, onSuccess } = renderWith();
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "Relocating to another city for family reasons" },
    });

    fireEvent.click(screen.getByText("Submit Resignation"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        reason: "Relocating to another city for family reasons",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Resignation submitted",
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });
});
