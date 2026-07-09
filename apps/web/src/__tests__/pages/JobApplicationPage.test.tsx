import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

const mockPost = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: (...args: any[]) => mockPost(...args) },
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
});
