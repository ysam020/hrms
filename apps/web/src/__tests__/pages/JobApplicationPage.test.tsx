import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
}));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<any>("react-router-dom");
  return { ...real, useNavigate: () => mockNavigate };
});

import JobApplicationPage from "@web/pages/JobApplicationPage";

const renderPage = (slug = "acme-co", id = "job1") =>
  render(
    <MemoryRouter
      future={routerFuture}
      initialEntries={[`/careers/${slug}/apply/${id}`]}
    >
      <Routes>
        <Route
          path="/careers/:slug/apply/:id"
          element={<JobApplicationPage />}
        />
      </Routes>
    </MemoryRouter>,
  );

const fillRequiredFields = async () => {
  await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
  await userEvent.type(screen.getByLabelText(/mobile number/i), "9876543210");
  await userEvent.type(
    screen.getByLabelText(/email address/i),
    "jane@example.com",
  );
  await userEvent.type(screen.getByLabelText(/aadhar number/i), "123456789012");

  const file = new File(["resume"], "resume.pdf", { type: "application/pdf" });
  const input = document.getElementById("resume-upload") as HTMLInputElement;
  await userEvent.upload(input, file);
  await waitFor(() =>
    expect(screen.getByText("resume.pdf")).toBeInTheDocument(),
  );
};

describe("JobApplicationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: null } });
  });

  it("submits to the slug-scoped apply-for-job endpoint", async () => {
    mockPost.mockResolvedValue({ data: { message: "Application submitted" } });
    renderPage("acme-co", "job1");

    await fillRequiredFields();
    await userEvent.click(
      screen.getByRole("button", { name: /submit application/i }),
    );

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith(
      "/apply-for-job/acme-co",
      expect.objectContaining({ name: "Jane Doe", email: "jane@example.com" }),
    );
  });

  it("shows the success screen after a successful submission", async () => {
    mockPost.mockResolvedValue({ data: { message: "Application submitted" } });
    renderPage();

    await fillRequiredFields();
    await userEvent.click(
      screen.getByRole("button", { name: /submit application/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("Application Submitted!")).toBeInTheDocument(),
    );
  });

  it("navigates back to the same tenant's careers list from the success screen", async () => {
    mockPost.mockResolvedValue({ data: { message: "Application submitted" } });
    renderPage("acme-co");

    await fillRequiredFields();
    await userEvent.click(
      screen.getByRole("button", { name: /submit application/i }),
    );
    await waitFor(() =>
      expect(screen.getByText("Application Submitted!")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("View More Openings"));
    expect(mockNavigate).toHaveBeenCalledWith("/careers/acme-co", {
      replace: true,
    });
  });

  it("shows the server error message when submission fails", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "This careers link doesn't exist." } },
    });
    renderPage();

    await fillRequiredFields();
    await userEvent.click(
      screen.getByRole("button", { name: /submit application/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("This careers link doesn't exist."),
      ).toBeInTheDocument(),
    );
  });

  it("fetches and displays the job's details alongside the form", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          jobTitle: "Backend Engineer",
          hiringManager: "Alex Kim",
          numberOfVacancies: 2,
          experience: 3,
          budget: [8, 12],
          applicationDeadline: "2026-12-31T00:00:00.000Z",
          jobDescription: "Build and maintain backend services.",
          requiredSkills: "Node.js, PostgreSQL",
        },
      },
    });
    renderPage("acme-co", "job1");

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/public/careers/acme-co/job/job1"),
    );
    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(
      screen.getByText("Build and maintain backend services."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
  });

  it("shows a warning and still renders the form when the job can't be found", async () => {
    mockGet.mockRejectedValue({
      response: { data: { message: "This job opening could not be found." } },
    });
    renderPage("acme-co", "missing-job");

    expect(
      await screen.findByText("This job opening could not be found."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
  });
});
