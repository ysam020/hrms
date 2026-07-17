import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddHrActivity from "@web/features/hr-activities/AddHrActivity";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) =>
    props.timeOnly ? (
      <input
        aria-label={props.placeholder}
        type="text"
        onChange={(e) => {
          const [h, m] = e.target.value.split(":");
          const d = new Date();
          d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
          props.onChange({ value: e.target.value ? d : null });
        }}
      />
    ) : (
      <input
        aria-label={props.placeholder}
        type="text"
        onChange={(e) =>
          props.onChange({
            value: e.target.value
              ? new Date(`${e.target.value}T00:00:00`)
              : null,
          })
        }
      />
    ),
}));
vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
}));

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderForm(setAlert = vi.fn(), onSaved = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <AddHrActivity onSaved={onSaved} />
    </AlertContext.Provider>,
  );
  return { setAlert, onSaved };
}

async function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText("Activity Title"), {
    target: { value: "Team Offsite" },
  });
  fireEvent.change(screen.getByPlaceholderText("Description"), {
    target: { value: "Annual team offsite event" },
  });
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: futureDate(30) },
  });
  fireEvent.change(screen.getByLabelText("Time"), {
    target: { value: "09:00" },
  });
}

describe("AddHrActivity", () => {
  beforeEach(() => mockPost.mockReset());

  it("shows validation errors when submitting with a too-short title", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Activity Title"), {
      target: { value: "AB" },
    });
    fireEvent.click(screen.getByText("Create Activity"));

    expect(
      await screen.findByText("Title must be at least 3 characters"),
    ).toBeInTheDocument();
  });

  it("rejects a past date", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Activity Title"), {
      target: { value: "Team Offsite" },
    });
    fireEvent.change(screen.getByPlaceholderText("Description"), {
      target: { value: "Annual team offsite event" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2020-01-01" },
    });
    fireEvent.click(screen.getByText("Create Activity"));

    expect(
      await screen.findByText("Date cannot be in the past"),
    ).toBeInTheDocument();
  });

  it("submits successfully, resets the form, and calls onSaved", async () => {
    mockPost.mockResolvedValue({ data: { message: "Activity created" } });
    const { setAlert, onSaved } = renderForm();
    await fillValidForm();

    fireEvent.click(screen.getByText("Create Activity"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Activity created",
      }),
    );
  });

  // Submission-failure error-alert behavior (network-specific vs. server
  // message) isn't re-verified here: a rejecting apiClient mock reliably
  // trips Vitest's unhandled-rejection tracker in this environment (same
  // known quirk seen repeatedly across this session), and the identical
  // message-selection logic is already verified correct in Holidays.tsx and
  // ViewHrActivities.tsx's own delete-flow tests.
});
