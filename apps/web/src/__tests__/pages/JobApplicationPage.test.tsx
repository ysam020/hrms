import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
}));

// The resume upload PUTs straight to S3 with plain axios (not apiClient),
// bypassing the presigned URL's auth interceptors — see
// JobApplicationPage.tsx's handleFileChange.
vi.mock("axios", () => ({
  default: {
    put: (...args: any[]) => mockPut(...args),
  },
}));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<any>("react-router-dom");
  return { ...real, useNavigate: () => mockNavigate };
});

import JobApplicationPage from "@web/pages/JobApplicationPage";

const RESUME_UPLOAD_RESPONSE = {
  data: {
    data: {
      url: "https://s3.example.com/presigned-put-url",
      fileUrl: "https://s3.example.com/job_applications/tenant/key.pdf",
    },
  },
};

// apiClient.post is shared between the resume-upload-url request (fired
// from handleFileChange) and the apply-for-job submission — this keeps the
// former on a fixed successful shape while letting each test control the
// latter's outcome independently.
const mockApplyForJob = (impl: (...args: any[]) => Promise<any>) => {
  mockPost.mockImplementation((url: string, ...rest: any[]) => {
    if (typeof url === "string" && url.includes("resume-upload-url")) {
      return Promise.resolve(RESUME_UPLOAD_RESPONSE);
    }
    return impl(url, ...rest);
  });
};

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
  // The filename label updates synchronously in handleFileChange, but the
  // "resume" field itself (required by validation) is only populated once
  // the presigned-upload request and the S3 PUT both resolve. Waiting on
  // the Submit button's real disabled state (see the race-condition fix in
  // JobApplicationPage.tsx) ties this to the actual condition instead of a
  // blind fixed-duration timer, which would add real wall-clock time to the
  // suite and risks being too short under CI load anyway.
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /submit application/i }),
    ).not.toBeDisabled(),
  );
};

describe("JobApplicationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: null } });
    mockPut.mockResolvedValue({ status: 200 });
    mockApplyForJob(() =>
      Promise.resolve({ data: { message: "Application submitted" } }),
    );
  });

  it("submits to the slug-scoped apply-for-job endpoint", async () => {
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
    mockApplyForJob(() =>
      Promise.reject({
        response: { data: { message: "This careers link doesn't exist." } },
      }),
    );
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

  describe("resume upload", () => {
    it("disables Submit while the file is still uploading, closing the race window", async () => {
      // Hold the presigned-upload request open so the test can assert on
      // the "still uploading" window directly, the same way a slow
      // connection in the field would experience it.
      let resolveUpload: (value: unknown) => void;
      mockPost.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          }),
      );

      renderPage();
      const file = new File(["resume"], "resume.pdf", {
        type: "application/pdf",
      });
      const input = document.getElementById(
        "resume-upload",
      ) as HTMLInputElement;

      await userEvent.upload(input, file);

      const submitButton = screen.getByRole("button", {
        name: /submit application/i,
      });
      expect(submitButton).toBeDisabled();

      resolveUpload!(RESUME_UPLOAD_RESPONSE);
      await waitFor(() => expect(submitButton).not.toBeDisabled());
    });

    it("rejects a non-PDF file with a client-side error, without touching formik's resume field", async () => {
      renderPage();
      const file = new File(["not a pdf"], "resume.docx", {
        type: "application/msword",
      });
      const input = document.getElementById(
        "resume-upload",
      ) as HTMLInputElement;

      // applyAccept: false — a real browser's accept=".pdf" filter is a UI
      // hint only; a drag-and-drop (or "All Files" picker option) can still
      // deliver a non-matching file, which is exactly the bypass this
      // client-side type check guards against.
      await userEvent.upload(input, file, { applyAccept: false });

      expect(
        await screen.findByText("Only PDF files are accepted."),
      ).toBeInTheDocument();
      expect(screen.queryByText("resume.docx")).not.toBeInTheDocument();
    });

    it("rejects a PDF over 5MB with a client-side error", async () => {
      renderPage();
      const bigContent = new Uint8Array(5 * 1024 * 1024 + 1);
      const file = new File([bigContent], "big-resume.pdf", {
        type: "application/pdf",
      });
      const input = document.getElementById(
        "resume-upload",
      ) as HTMLInputElement;

      await userEvent.upload(input, file);

      expect(
        await screen.findByText("Resume must be smaller than 5MB."),
      ).toBeInTheDocument();
    });

    it("marks the file input aria-invalid and links it to the error message once a required-field validation error is touched", async () => {
      renderPage();
      await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
      await userEvent.type(
        screen.getByLabelText(/mobile number/i),
        "9876543210",
      );
      await userEvent.type(
        screen.getByLabelText(/email address/i),
        "jane@example.com",
      );
      await userEvent.type(
        screen.getByLabelText(/aadhar number/i),
        "123456789012",
      );

      const submitButton = screen.getByRole("button", {
        name: /submit application/i,
      });
      await userEvent.click(submitButton);

      const input = document.getElementById(
        "resume-upload",
      ) as HTMLInputElement;
      await waitFor(() =>
        expect(input).toHaveAttribute("aria-invalid", "true"),
      );
      expect(input).toHaveAttribute("aria-describedby", "resume-error");
      const errorEl = document.getElementById("resume-error");
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toBeTruthy();
    });
  });
});
