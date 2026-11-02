import { createRef, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import { UserContext } from "@web/app/providers/UserContext";
import { Route, Routes } from "react-router-dom";

// React 19 adoption (docs/react-19-features.md): form actions and
// SubmitButton, optimistic updates, ref as a prop, <title>, root error
// reporting.

const put = vi.fn();
const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock("@next/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@next/lib/api")>();
  return {
    ...actual,
    apiClient: {
      put: (...a: any[]) => put(...a),
      get: (...a: any[]) => get(...a),
      post: (...a: any[]) => post(...a),
      patch: (...a: any[]) => patch(...a),
    },
  };
});

/** A promise and the functions that settle it. */
function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const httpError = (status: number, message = "Refused") =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status, data: { message } },
  });

beforeEach(() => {
  [put, get, post, patch].forEach((m) => m.mockReset());
});

describe("SubmitButton", () => {
  it("is busy, disabled and renamed while its form's action runs", async () => {
    const { SubmitButton } = await import("@next/ui");
    const run = deferred<void>();
    const action = vi.fn(() => run.promise);
    render(
      <form action={action}>
        <SubmitButton busyLabel="Saving…">Save</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "submit");
    await act(async () => fireEvent.click(button));
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAccessibleName("Saving…");
    // A second press while busy doesn't submit again.
    await act(async () => fireEvent.click(button));
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => run.resolve(undefined));
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleName("Save");
  });

  it("keeps controlled fields after the action resets the form", async () => {
    const { SubmitButton, TextArea } = await import("@next/ui");
    function Composer() {
      const [text, setText] = useState("");
      return (
        <form
          action={async () => {
            const sent = text;
            setText("");
            await Promise.resolve();
            setText(sent); // as on a failed send
          }}
        >
          <TextArea
            aria-label="Reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <SubmitButton>Send</SubmitButton>
        </form>
      );
    }
    render(<Composer />);
    const box = screen.getByLabelText("Reply");
    fireEvent.change(box, { target: { value: "Hello" } });
    await act(async () => fireEvent.click(screen.getByText("Send")));
    await waitFor(() => expect(box).toHaveValue("Hello"));
  });
});

describe("attendance correction (validation + form action)", () => {
  // UserCombobox caches lookups for the session, so every test answers alike.
  const directory = async (url: string) =>
    url.includes("summary") || url.includes("attendance")
      ? { data: { data: {} } }
      : {
          data: {
            data: [
              {
                id: "u1",
                username: "asha",
                firstName: "Asha",
                lastName: "Rao",
              },
            ],
          },
        };

  async function renderCorrection() {
    const { Correction } =
      await import("@next/features/attendance/components/Correction");
    const setAlert = vi.fn();
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <Correction />
      </AlertContext.Provider>,
    );
    return { setAlert };
  }

  it("shows errors and focuses the first without calling the gateway", async () => {
    // Focus lands in the employee search, which looks people up.
    get.mockImplementation(directory);
    await renderCorrection();
    await act(async () => fireEvent.click(screen.getByText("Save Correction")));
    expect(screen.getByText("Choose an employee.")).toBeInTheDocument();
    expect(screen.getByText("Enter the time in.")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("aria-invalid", "true"),
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("saves through the action, busy until the gateway answers", async () => {
    get.mockImplementation(directory);
    const req = deferred();
    put.mockReturnValue(req.promise);
    const { setAlert } = await renderCorrection();
    const who = screen.getByRole("combobox");
    fireEvent.focus(who);
    fireEvent.click(await screen.findByRole("option"));
    fireEvent.change(
      screen.getByLabelText("Date and Time", { selector: "input:not([min])" }),
      {
        target: { value: "2026-11-02T09:30" },
      },
    );
    const save = screen.getByRole("button", { name: "Save Correction" });
    await act(async () => fireEvent.click(save));
    expect(put).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleName("Saving…");
    await act(async () => fireEvent.click(save));
    expect(put).toHaveBeenCalledTimes(1);

    await act(async () => req.resolve({ data: { message: "Done." } }));
    await waitFor(() => expect(save).toBeEnabled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Done." }),
    );
    expect(screen.getByText("Correction saved")).toBeInTheDocument();
  });
});

describe("ref as a prop", () => {
  it("reaches the native element of each kit control", async () => {
    const ui = await import("@next/ui");
    const input = createRef<HTMLInputElement>();
    const area = createRef<HTMLTextAreaElement>();
    const search = createRef<HTMLInputElement>();
    const amount = createRef<HTMLInputElement>();
    const button = createRef<HTMLButtonElement>();
    const icon = createRef<HTMLButtonElement>();
    const box = createRef<HTMLInputElement>();
    render(
      <>
        <ui.TextInput ref={input} aria-label="name" />
        <ui.TextArea ref={area} aria-label="notes" />
        <ui.SearchField ref={search} label="Search" />
        <ui.AmountInput ref={amount} value={5} onValue={() => {}} />
        <ui.Button ref={button}>Go</ui.Button>
        <ui.IconButton ref={icon} icon="x" label="Close" />
        <ui.Checkbox ref={box} indeterminate aria-label="All" />
      </>,
    );
    expect(input.current).toBeInstanceOf(HTMLInputElement);
    expect(area.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(search.current?.type).toBe("search");
    expect(amount.current?.inputMode).toBe("numeric");
    expect(button.current?.textContent).toContain("Go");
    expect(icon.current).toHaveAccessibleName("Close");
    expect(box.current?.indeterminate).toBe(true);
    input.current!.focus();
    expect(document.activeElement).toBe(input.current);
  });

  it("calls a callback ref with the element and with null on unmount", async () => {
    const { Checkbox, TransitionLink } = {
      ...(await import("@next/ui")),
      ...(await import("@next/motion")),
    };
    const seen: (string | null)[] = [];
    const { unmount } = render(
      <MemoryRouter>
        <Checkbox
          aria-label="One"
          ref={(el) => void seen.push(el ? el.tagName : null)}
        />
        <TransitionLink
          to="/x"
          ref={(el) => void seen.push(el ? el.tagName : null)}
        >
          x
        </TransitionLink>
      </MemoryRouter>,
    );
    expect(seen).toEqual(["INPUT", "A"]);
    unmount();
    expect(seen.filter((v) => v === null)).toHaveLength(2);
  });
});

describe("notifications (useOptimistic)", () => {
  const n = (id: string) => ({ _id: id, title: `Note ${id}`, message: "" });

  function renderBell(initial: any[]) {
    const setAlert = vi.fn();
    let setList!: (fn: any) => void;
    function Harness({ children }: { children: React.ReactNode }) {
      const [notifications, setNotifications] = useState(initial);
      setList = setNotifications;
      return (
        <AlertContext.Provider value={{ setAlert } as any}>
          <NotificationContext.Provider
            value={{ notifications, setNotifications, loading: false } as any}
          >
            {children}
          </NotificationContext.Provider>
        </AlertContext.Provider>
      );
    }
    return {
      setAlert,
      Harness,
      push: (x: any) => setList((l: any[]) => [x, ...l]),
    };
  }

  it("hides a cleared notification at once and restores only it on failure", async () => {
    const { NotificationsButton } = await import("@next/shell/Notifications");
    const a = deferred();
    const b = deferred();
    put.mockImplementation((url: string) =>
      String(url).includes("/a") || String(url).endsWith("a")
        ? a.promise
        : b.promise,
    );
    const { setAlert, Harness, push } = renderBell([n("a"), n("b")]);
    render(
      <MemoryRouter>
        <Harness>
          <NotificationsButton />
        </Harness>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Clear “Note a”" })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Clear “Note b”" })),
    );
    expect(screen.queryByText("Note a")).toBeNull();
    expect(screen.queryByText("Note b")).toBeNull();
    // One arrives over the socket while both requests are in flight.
    await act(async () => push(n("c")));
    expect(screen.getByText("Note c")).toBeInTheDocument();

    await act(async () => {
      b.resolve({});
      a.reject(httpError(500, "Couldn’t clear"));
    });
    await waitFor(() => expect(screen.getByText("Note a")).toBeInTheDocument());
    // The failed clear brings back only its own row; the confirmed clear and
    // the newer arrival both survive the rollback.
    expect(screen.queryByText("Note b")).toBeNull();
    expect(screen.getByText("Note c")).toBeInTheDocument();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "Couldn’t clear" }),
    );
  });
});

describe("approval decisions (useOptimistic)", () => {
  const item = {
    instanceId: "i1",
    module: "leave",
    summary: "Asha · 2 days leave",
    requestedByName: "Asha",
    stepOrder: 1,
  } as any;

  async function renderApprovals() {
    const { default: Approvals } =
      await import("@next/features/approvals/Approvals");
    const setAlert = vi.fn();
    const refetch = vi.fn();
    render(
      <MemoryRouter>
        <AlertContext.Provider value={{ setAlert } as any}>
          <ApprovalsBadgeContext.Provider
            value={
              {
                pendingApprovalItems: [item],
                loadingPendingApprovals: false,
                refetchPendingApprovals: refetch,
              } as any
            }
          >
            <Approvals />
          </ApprovalsBadgeContext.Provider>
        </AlertContext.Provider>
      </MemoryRouter>,
    );
    return { setAlert, refetch };
  }
  const list = () =>
    within(document.querySelector('[data-tour="approvals-list"]')!);

  async function approve(comment = "") {
    fireEvent.click(
      screen.getByRole("button", { name: `Approve ${item.summary}` }),
    );
    if (comment)
      fireEvent.change(await screen.findByLabelText(/Comment/), {
        target: { value: comment },
      });
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: "Approve" })),
    );
  }

  it("marks the row pending, then removes it once the gateway confirms", async () => {
    const req = deferred();
    put.mockReturnValue(req.promise);
    const { setAlert, refetch } = await renderApprovals();
    await approve("Enjoy");
    expect(put).toHaveBeenCalledWith(expect.stringContaining("i1"), {
      decision: "approved",
      comment: "Enjoy",
    });
    // Not reported as done: still listed, marked as being sent.
    expect(list().getByText(item.summary)).toBeInTheDocument();
    // A live region: its text is announced as it appears.
    expect(list().getByRole("status")).toHaveTextContent("Approving…");
    expect(
      list().queryByRole("button", { name: `Approve ${item.summary}` }),
    ).toBeNull();
    expect(setAlert).not.toHaveBeenCalled();

    await act(async () => req.resolve({}));
    await waitFor(() => expect(list().queryByText(item.summary)).toBeNull());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success" }),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("restores the row and reopens the dialog with the comment on a retryable failure", async () => {
    put.mockImplementation(async () => {
      throw httpError(503, "Try again later");
    });
    const { setAlert, refetch } = await renderApprovals();
    await approve("Looks fine");
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Try again later",
        }),
      ),
    );
    // Back in the dialog, comment intact; the row has its actions again.
    expect(await screen.findByLabelText(/Comment/)).toHaveValue("Looks fine");
    await waitFor(() =>
      expect(
        list().getByRole("button", {
          name: `Approve ${item.summary}`,
          hidden: true, // behind the open dialog
        }),
      ).toBeInTheDocument(),
    );
    expect(refetch).not.toHaveBeenCalled();
  });

  it("refetches instead of reopening when the gateway refuses the decision", async () => {
    put.mockImplementation(async () => {
      throw httpError(409, "Already decided");
    });
    const { refetch } = await renderApprovals();
    await approve();
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText(/Comment/)).toBeNull());
  });
});

describe("helpdesk ticket (useOptimistic)", () => {
  const hr = { username: "hr", first_name: "Hema", isSuperUser: true };
  let ticket: any;

  async function renderTicket() {
    const { default: Ticket } = await import("@next/features/helpdesk/Ticket");
    get.mockImplementation(async () => ({ data: { data: ticket } }));
    const setAlert = vi.fn();
    render(
      <MemoryRouter initialEntries={["/helpdesk/t1"]}>
        <AlertContext.Provider value={{ setAlert } as any}>
          <UserContext.Provider value={{ user: hr } as any}>
            <Routes>
              <Route path="/helpdesk/:ticketId" element={<Ticket />} />
            </Routes>
          </UserContext.Provider>
        </AlertContext.Provider>
      </MemoryRouter>,
    );
    await screen.findByText("Printer is down");
    return { setAlert };
  }

  beforeEach(() => {
    ticket = {
      id: "t1",
      ticketNo: "HD-7",
      title: "Printer is down",
      description: "Third floor",
      status: "open",
      comments: [],
    };
  });

  it("shows a new status at once and keeps it once the server agrees", async () => {
    const req = deferred();
    patch.mockReturnValue(req.promise);
    await renderTicket();
    const select = screen.getByLabelText("Status");
    await act(async () =>
      fireEvent.change(select, { target: { value: "resolved" } }),
    );
    expect(select).toHaveValue("resolved");
    expect(select).toBeDisabled(); // no second change racing this one
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    ticket = { ...ticket, status: "resolved" };
    await act(async () => req.resolve({}));
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue("resolved");
  });

  it("keeps a confirmed status when the reload after it fails", async () => {
    patch.mockResolvedValue({});
    await renderTicket();
    get.mockImplementation(async () => {
      throw httpError(502, "Bad gateway");
    });
    const select = screen.getByLabelText("Status");
    await act(async () =>
      fireEvent.change(select, { target: { value: "in_progress" } }),
    );
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue("in_progress");
  });

  it("puts the old status back when the change fails", async () => {
    patch.mockImplementation(async () => {
      throw httpError(403, "Not allowed");
    });
    const { setAlert } = await renderTicket();
    const select = screen.getByLabelText("Status");
    await act(async () =>
      fireEvent.change(select, { target: { value: "closed" } }),
    );
    await waitFor(() => expect(select).toHaveValue("open"));
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "Not allowed" }),
    );
  });

  it("shows a reply as sending, then the saved one; a failed one returns to the box", async () => {
    const req = deferred();
    post.mockReturnValueOnce(req.promise);
    await renderTicket();
    const box = screen.getByLabelText("Reply");
    fireEvent.change(box, { target: { value: "Rebooted it" } });
    await act(async () => fireEvent.click(screen.getByText("Send Reply")));
    expect(screen.getByText("Rebooted it")).toBeInTheDocument();
    expect(screen.getByText(/Sending…/)).toBeInTheDocument();
    expect(box).toHaveValue("");

    ticket = {
      ...ticket,
      comments: [
        {
          id: "c1",
          comment: "Rebooted it",
          author: hr,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    await act(async () => req.resolve({}));
    await waitFor(() => expect(screen.queryByText(/Sending…/)).toBeNull());
    expect(screen.getByText("Rebooted it")).toBeInTheDocument();

    post.mockImplementationOnce(async () => {
      throw httpError(500, "Couldn’t send");
    });
    fireEvent.change(box, { target: { value: "Still broken" } });
    await act(async () => fireEvent.click(screen.getByText("Send Reply")));
    await waitFor(() => {
      expect(box).toHaveValue("Still broken");
      expect(screen.queryByText(/Sending…/)).toBeNull();
    });
    expect(screen.getAllByText(/Still broken/)).toHaveLength(1); // the box
  });
});

describe("document titles", () => {
  it("lets screens own a <title> while seo.ts only writes the document's", async () => {
    // index.html's own title, present before the app (and seo.ts) load.
    document.head.querySelectorAll("title").forEach((t) => t.remove());
    const own = document.createElement("title");
    own.textContent = "Praesto";
    document.head.append(own);
    vi.resetModules();
    const { applyPageMeta } = await import("@next/app/seo");

    const { unmount } = render(<title>Attendance · Praesto</title>);
    expect(document.title).toBe("Attendance · Praesto");
    applyPageMeta("/attendance");
    // The screen's title stands; the document's falls back to the name.
    expect(document.title).toBe("Attendance · Praesto");
    expect(own.textContent).toBe("Praesto");
    unmount();
    expect(document.title).toBe("Praesto");

    applyPageMeta("/privacy-policy");
    expect(document.title).toBe("Privacy Policy · Praesto");
    applyPageMeta("/dashboard");
    expect(document.title).toBe("Praesto");
  });
});

describe("resource hints", () => {
  it("connects to Razorpay early, and fetches Checkout only where paying is next", async () => {
    const { prepareRazorpay } = await import("@web/shared/constants/billing");
    const hints = () =>
      [...document.head.querySelectorAll("link")]
        .filter((l) => /razorpay/.test(l.href))
        .map(
          (l) =>
            `${l.rel}${l.getAttribute("as") ? `:${l.getAttribute("as")}` : ""} ${l.href}`,
        );
    function Billing({ paying }: { paying: boolean }) {
      prepareRazorpay({ fetch: paying });
      return null;
    }
    const { rerender } = render(<Billing paying={false} />);
    rerender(<Billing paying={false} />);
    expect(hints()).toEqual(["preconnect https://checkout.razorpay.com/"]);
    rerender(<Billing paying />);
    rerender(<Billing paying />);
    // Once each, however often the screen renders.
    expect(hints()).toEqual([
      "preconnect https://checkout.razorpay.com/",
      "preload:script https://checkout.razorpay.com/v1/checkout.js",
    ]);
  });
});

describe("root error reporting", () => {
  it("reports an error once, survives odd values and failing sinks", async () => {
    const { createErrorHandlers } = await import("@next/app/errorReporting");
    const sink = vi.fn();
    const h = createErrorHandlers(sink, { dedupe: true });
    const info = { componentStack: "\n    at Row" };
    h.onCaughtError(new Error("Boom"), info);
    h.onCaughtError(new Error("Boom"), info);
    h.onUncaughtError(new Error("Boom"), info);
    expect(sink).toHaveBeenCalledTimes(2); // caught once, uncaught once

    h.onRecoverableError(Object.create(null), info);
    expect(sink).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "[value that can't be printed]" }),
      expect.anything(),
    );

    const throwing = createErrorHandlers(() => {
      throw new Error("sink down");
    });
    expect(() => throwing.onCaughtError(new Error("x"), info)).not.toThrow();
  });

  it("drops an error raised while a report is being made", async () => {
    const { createErrorHandlers } = await import("@next/app/errorReporting");
    let h!: ReturnType<typeof createErrorHandlers>;
    const sink = vi.fn(() => h.onUncaughtError(new Error("inner"), {}));
    h = createErrorHandlers(sink);
    h.onCaughtError(new Error("outer"), {});
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
