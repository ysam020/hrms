import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExitInterviewQuestionsTab } from "@web/features/settings/exit-policy/ExitInterviewQuestionsTab";
import type { ExitQuestion } from "@web/features/settings/exit-policy/types";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

async function chooseOption(combobox: HTMLElement, optionText: string) {
  fireEvent.mouseDown(combobox);
  fireEvent.click(await screen.findByRole("option", { name: optionText }));
}

function Harness({
  initial,
  canEdit = true,
  setAlert = vi.fn(),
}: {
  initial: ExitQuestion[];
  canEdit?: boolean;
  setAlert?: any;
}) {
  const [questions, setQuestions] = useState(initial);
  return (
    <ExitInterviewQuestionsTab
      questions={questions}
      setQuestions={setQuestions}
      canEdit={canEdit}
      setAlert={setAlert}
    />
  );
}

function q(overrides: Partial<ExitQuestion> = {}): ExitQuestion {
  return {
    id: "q1",
    label: "How was it?",
    type: "text",
    required: false,
    ...overrides,
  };
}

describe("ExitInterviewQuestionsTab", () => {
  beforeEach(() => mockPut.mockReset());

  it("hides Add/Save and disables fields for a read-only user", () => {
    render(<Harness initial={[q()]} canEdit={false} />);
    expect(
      screen.queryByText("Add question", { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Save questions", { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Question 1")).toBeDisabled();
  });

  it("adds a new blank text question", () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByText("Add question", { selector: "span" }));
    expect(screen.getByLabelText("Question 1")).toHaveValue("");
  });

  it("edits a question's label", () => {
    render(<Harness initial={[q({ label: "" })]} />);
    fireEvent.change(screen.getByLabelText("Question 1"), {
      target: { value: "Would you return?" },
    });
    expect(screen.getByLabelText("Question 1")).toHaveValue(
      "Would you return?",
    );
  });

  it("changes a question's type", async () => {
    render(<Harness initial={[q({ type: "text" })]} />);
    await chooseOption(screen.getByRole("combobox"), "Rating");
    expect(screen.getByRole("combobox")).toHaveTextContent("Rating");
  });

  it("toggles a question's required flag", () => {
    render(<Harness initial={[q({ required: false })]} />);
    const toggle = screen.getByRole("checkbox");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("removes a question", () => {
    render(
      <Harness
        initial={[
          q({ id: "q1", label: "First" }),
          q({ id: "q2", label: "Second" }),
        ]}
      />,
    );
    expect(screen.getByLabelText("Question 2")).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("DeleteIcon")[0].closest("button")!);
    expect(screen.queryByLabelText("Question 2")).not.toBeInTheDocument();
    // Removing the first question shifts "Second" up into the "Question 1" slot.
    expect(screen.getByLabelText("Question 1")).toHaveValue("Second");
  });

  it("saves the current question list and shows a success alert", async () => {
    mockPut.mockResolvedValue({});
    const setAlert = vi.fn();
    render(
      <Harness initial={[q({ label: "How was it?" })]} setAlert={setAlert} />,
    );

    fireEvent.click(screen.getByText("Save questions", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith("/exit-interview-templates", {
        questions: [q({ label: "How was it?" })],
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Exit interview questions saved.",
      }),
    );
  });
});
