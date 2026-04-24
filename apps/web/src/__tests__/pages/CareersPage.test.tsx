import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

const mockGet = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: (...args: any[]) => mockGet(...args) },
}));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<any>("react-router-dom");
  return { ...real, useNavigate: () => mockNavigate };
});

import CareersPage from "@web/pages/CareersPage";

const renderPage = () =>
  render(
    <MemoryRouter future={routerFuture}>
      <CareersPage />
    </MemoryRouter>,
  );

const makeJob = (overrides: Record<string, any> = {}) => ({
  _id: "job1",
  jobTitle: "Frontend Engineer",
  hiringManager: "Alice",
  requiredSkills: "React, TypeScript",
  jobDescription: "Build great UIs",
  numberOfVacancies: 2,
  experience: 3,
  budgetRange: "10-15 LPA",
  formattedDeadline: "30 Apr 2026",
  ...overrides,
});

describe("CareersPage – loading state", () => {
  it("shows a spinner while the API call is pending", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});

describe("CareersPage – empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [] } });
  });

  it("shows 'No open positions' message when job list is empty", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/no open positions at the moment/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows 'No matching positions found' when search yields no results", async () => {
    mockGet.mockResolvedValue({
      data: { data: [makeJob({ jobTitle: "Backend Engineer" })] },
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Backend Engineer")).toBeInTheDocument(),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/search by title or skills/i),
      "frontend",
    );

    await waitFor(() =>
      expect(
        screen.getByText(/no matching positions found/i),
      ).toBeInTheDocument(),
    );
  });
});

describe("CareersPage – job list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders job cards after successful fetch", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          makeJob(),
          makeJob({ _id: "job2", jobTitle: "Backend Engineer" }),
        ],
      },
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Frontend Engineer")).toBeInTheDocument(),
    );
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
  });

  it("handles flat array response (res.data is array directly)", async () => {
    mockGet.mockResolvedValue({ data: [makeJob()] });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Frontend Engineer")).toBeInTheDocument(),
    );
  });

  it("shows hiring manager name when present", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeJob()] } });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/hiring manager: alice/i)).toBeInTheDocument(),
    );
  });

  it("shows job description snippet", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeJob()] } });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Build great UIs")).toBeInTheDocument(),
    );
  });

  it("shows skills caption", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeJob()] } });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/react, typescript/i)).toBeInTheDocument(),
    );
  });

  it("shows empty list on API error", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));

    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/no open positions at the moment/i),
      ).toBeInTheDocument(),
    );
  });
});

describe("CareersPage – search filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        data: [
          makeJob({
            _id: "j1",
            jobTitle: "Frontend Engineer",
            requiredSkills: "React",
          }),
          makeJob({
            _id: "j2",
            jobTitle: "Backend Engineer",
            requiredSkills: "Node.js",
          }),
        ],
      },
    });
  });

  it("filters jobs by title search", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Frontend Engineer")).toBeInTheDocument(),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/search by title or skills/i),
      "Backend",
    );

    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Frontend Engineer")).not.toBeInTheDocument();
  });

  it("filters jobs by skills search", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Frontend Engineer")).toBeInTheDocument(),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/search by title or skills/i),
      "Node",
    );

    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Frontend Engineer")).not.toBeInTheDocument();
  });

  it("is case-insensitive", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Frontend Engineer")).toBeInTheDocument(),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/search by title or skills/i),
      "frontend",
    );

    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
  });
});

describe("CareersPage – navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [makeJob()] } });
  });

  it("navigates back when the back icon button is clicked", async () => {
    renderPage();
    const backBtn = screen.getByRole("button", { name: "" }); // ArrowBack icon button
    await userEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("navigates to /careers/apply/:id when 'Apply Now' is clicked", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Apply Now")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText("Apply Now"));
    expect(mockNavigate).toHaveBeenCalledWith("/careers/apply/job1");
  });
});
