import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const post = vi.fn();
vi.mock("@next/lib/api", () => ({
  apiClient: { post: (...a: any[]) => post(...a) },
  errorMessage: (e: any) => e?.message ?? "error",
}));
const trackEvent = vi.fn();
vi.mock("@next/app/analytics", async (orig) => ({
  ...(await orig<typeof import("@next/app/analytics")>()),
  trackEvent: (...a: any[]) => trackEvent(...a),
}));

import {
  BookDemoPage,
  ContactPage,
  validateLead,
} from "@next/features/public/LeadForm";
import {
  attributionFrom,
  captureAttribution,
  readAttribution,
} from "@next/app/attribution";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/book-demo" element={<BookDemoPage />} />
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "Asha Rao");
  await user.type(screen.getByLabelText("Work email"), "asha@example.co.in");
  await user.type(screen.getByLabelText("Company"), "Example Industries");
  fireEvent.change(screen.getByLabelText("Company size"), {
    target: { value: "26–100" },
  });
  await user.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  post.mockReset();
  trackEvent.mockReset();
  sessionStorage.clear();
});

describe("Book a Demo form", () => {
  it("shows what's missing and sends nothing", async () => {
    const user = userEvent.setup();
    renderAt("/book-demo");
    await user.click(screen.getByRole("button", { name: "Request a Demo" }));
    expect(screen.getByText("Enter your full name")).toBeInTheDocument();
    expect(
      screen.getByText("Enter a valid work email address"),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose your company size")).toBeInTheDocument();
    expect(
      screen.getByText("Please confirm so we can reply to you"),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("submits once, then records one conversion with no personal data", async () => {
    sessionStorage.setItem(
      "px-lead-attribution",
      JSON.stringify({ utmSource: "linkedin", landingPage: "/" }),
    );
    let resolve!: (v: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderAt("/book-demo");
    await fillRequired(user);
    const button = screen.getByRole("button", { name: "Request a Demo" });
    await user.click(button);
    await user.click(button); // a second click while the first is in flight
    expect(post).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled(); // not before the server answers
    resolve({ status: 201, data: { success: true } });

    expect(await screen.findByText("Thank you")).toBeInTheDocument();
    const [url, body] = post.mock.calls[0];
    expect(url).toBe("/public/leads");
    expect(body).toMatchObject({
      kind: "demo",
      name: "Asha Rao",
      email: "asha@example.co.in",
      companyName: "Example Industries",
      companySize: "26–100",
      consent: true,
      attribution: { utmSource: "linkedin", landingPage: "/" },
    });
    expect(body).not.toHaveProperty("website");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("demo_request", {
      form_type: "demo",
    });
    expect(JSON.stringify(trackEvent.mock.calls)).not.toMatch(
      /asha|Example|linkedin/i,
    );
  });

  it("records no conversion when the server refuses", async () => {
    post.mockRejectedValue(new Error("Too many requests"));
    const user = userEvent.setup();
    renderAt("/book-demo");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Request a Demo" }));
    expect(
      await screen.findByText("Your request wasn’t sent"),
    ).toBeInTheDocument();
    expect(screen.getByText("Too many requests")).toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("Contact Sales form", () => {
  it("opens on the custom-solution topic from the pricing link, requires the request, and records contact_submit", async () => {
    post.mockResolvedValue({ status: 201, data: { success: true } });
    const user = userEvent.setup();
    renderAt("/contact?topic=custom");
    expect(
      screen.getByRole("heading", { name: "Get a Custom HRMS Solution" }),
    ).toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Send Request" }));
    expect(
      screen.getByText("Tell us briefly what you need"),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("What do you need?"),
      "Shift rosters for three plants.",
    );
    await user.click(screen.getByRole("button", { name: "Send Request" }));
    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("contact_submit", {
        form_type: "custom",
      }),
    );
    expect(post.mock.calls[0][1]).toMatchObject({ kind: "custom" });
    expect(post.mock.calls[0][1]).not.toHaveProperty("preferredDate");
  });

  it("defaults to a sales enquiry", () => {
    renderAt("/contact");
    expect(
      screen.getByRole("heading", { name: "Contact Sales" }),
    ).toBeInTheDocument();
  });
});

describe("lead validation", () => {
  const base = {
    name: "Asha Rao",
    email: "asha@example.co.in",
    phone: "",
    companyName: "Example",
    companySize: "1–25",
    designation: "",
    message: "",
    preferredDate: "",
    preferredTime: "",
    consent: true,
    website: "",
  };
  it("accepts a minimal valid form and checks the phone only when given", () => {
    expect(validateLead(base, "demo")).toEqual({});
    expect(validateLead({ ...base, phone: "123" }, "demo")).toHaveProperty(
      "phone",
    );
    expect(validateLead({ ...base, phone: "+91 98765 43210" }, "demo")).toEqual(
      {},
    );
  });
  it("refuses a past preferred date", () => {
    expect(
      validateLead({ ...base, preferredDate: "2001-01-01" }, "demo"),
    ).toHaveProperty("preferredDate");
  });
});

describe("attribution", () => {
  it("keeps campaign labels, the landing path and the referrer host only", () => {
    expect(
      attributionFrom(
        "/",
        "?utm_source=linkedin&utm_medium=social&utm_campaign=a%40b.com&utm_term=9876543210&email=x%40y.com",
        "https://www.linkedin.com/feed/?trk=1",
        "praesto.in",
      ),
    ).toEqual({
      utmSource: "linkedin",
      utmMedium: "social",
      landingPage: "/",
      referrerHost: "www.linkedin.com",
    });
  });

  it("ignores our own site as a referrer", () => {
    expect(
      attributionFrom("/pricing", "", "https://praesto.in/", "praesto.in"),
    ).toEqual({ landingPage: "/pricing" });
  });

  it("keeps the first public page of the visit only", () => {
    captureAttribution("/dashboard"); // inside the app: never recorded
    expect(readAttribution()).toEqual({});
    captureAttribution("/");
    const first = readAttribution();
    expect(first.landingPage).toBe("/");
    captureAttribution("/book-demo");
    expect(readAttribution()).toEqual(first);
  });
});
