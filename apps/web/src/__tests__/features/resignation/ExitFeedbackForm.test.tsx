import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExitFeedbackForm from "@web/features/resignation/ExitFeedbackForm";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const QUESTIONS = [
  {
    id: "q1",
    label: "How was your overall experience?",
    type: "rating",
    required: true,
  },
  {
    id: "q2",
    label: "Would you recommend us as an employer?",
    type: "boolean",
    required: true,
  },
  {
    id: "q3",
    label: "Any additional comments?",
    type: "text",
    required: false,
  },
];

function setup({
  questions = QUESTIONS,
  resignation = { id: "res1", status: "Approved" },
  templateFails = false,
  resignationFails = false,
} = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/exit-interview-templates") {
      if (templateFails) return Promise.reject(new Error("fail"));
      return Promise.resolve({ data: { data: { questions } } });
    }
    if (url === "/my-resignation") {
      if (resignationFails) return Promise.reject(new Error("fail"));
      return Promise.resolve({ data: { data: resignation } });
    }
    return Promise.resolve({ data: { data: {} } });
  });
}

function renderForm(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ExitFeedbackForm />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("ExitFeedbackForm", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("shows an info message when there is no resignation on record", async () => {
    setup({ resignation: null });
    renderForm();
    expect(
      await screen.findByText(
        "You don't have a resignation on record — exit feedback isn't applicable.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an info message when the resignation isn't approved yet", async () => {
    setup({ resignation: { id: "res1", status: "Pending" } });
    renderForm();
    expect(
      await screen.findByText(
        "Exit feedback is available once your resignation is approved.",
      ),
    ).toBeInTheDocument();
  });

  it("renders rating, boolean, and text questions from the template", async () => {
    setup();
    renderForm();
    expect(
      await screen.findByText("How was your overall experience?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Would you recommend us as an employer?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Any additional comments?")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(0);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("disables submit until all required questions are answered", async () => {
    setup();
    renderForm();
    await screen.findByText("How was your overall experience?");

    const submitBtn = screen
      .getByText("Submit Feedback", { selector: "span" })
      .closest("button")!;
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getAllByRole("radio")[3]); // 4th star of the rating
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByText("Yes"));
    expect(submitBtn).not.toBeDisabled();
  });

  it("submits only the answered questions and shows a success alert", async () => {
    setup();
    mockPost.mockResolvedValue({
      data: { message: "Thanks for your feedback" },
    });
    const { setAlert } = renderForm();
    await screen.findByText("How was your overall experience?");

    fireEvent.click(screen.getAllByRole("radio")[3]);
    fireEvent.click(screen.getByText("Yes"));
    fireEvent.click(screen.getByText("Submit Feedback", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/resignations/res1/exit-interview-response",
        {
          answers: [
            { questionId: "q1", value: 4 },
            { questionId: "q2", value: true },
          ],
        },
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Thanks for your feedback",
      }),
    );
    expect(
      await screen.findByText("Thanks — your feedback has been recorded."),
    ).toBeInTheDocument();
  });

  it("shows a distinct message for a network-error submission failure", async () => {
    setup();
    mockPost.mockRejectedValue({ message: "Network Error" });
    const { setAlert } = renderForm();
    await screen.findByText("How was your overall experience?");

    fireEvent.click(screen.getAllByRole("radio")[3]);
    fireEvent.click(screen.getByText("Yes"));
    fireEvent.click(screen.getByText("Submit Feedback", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message:
            "Network Error, your details will be submitted when you are back online",
        }),
      ),
    );
  });
});
