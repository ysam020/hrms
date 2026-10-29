import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { UserCombobox } from "@next/ui/UserCombobox";
import type { Person } from "@next/ui/PeoplePicker";

// The directory search goes through the app's axios client; tests answer
// each request by hand to control order and timing.
const get = vi.fn();
vi.mock("@next/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@next/lib/api")>();
  return { ...actual, apiClient: { get: (...a: any[]) => get(...a) } };
});

const interviewers: Person[] = [
  { id: "1", username: "asharao", name: "Asha Rao" },
  { id: "2", username: "benito", name: "Ben Ito" },
  { id: "3", username: "chenwei", name: "Chen Wei" },
];

function Harness(props: Partial<Parameters<typeof UserCombobox>[0]>) {
  const [value, setValue] = useState("");
  return (
    <>
      <UserCombobox
        label="Person"
        value={value}
        onChange={(v) => setValue(v)}
        {...props}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const input = () => screen.getByRole("combobox", { name: "Person" });
const options = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("UserCombobox", () => {
  beforeEach(() => {
    get.mockReset();
    vi.useRealTimers();
  });

  it("filters a fixed list and submits the chosen person's username", () => {
    render(<Harness options={interviewers} valueKey="username" />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "be" } });
    expect(options()).toEqual([expect.stringContaining("Ben Ito")]);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByTestId("value")).toHaveTextContent("benito");
    expect(input()).toHaveValue("Ben Ito");
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("moves the active option with the arrow keys", () => {
    render(<Harness options={interviewers} />);
    fireEvent.focus(input());
    expect(input()).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-0$/),
    );
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    // valueKey defaults to the user id.
    expect(screen.getByTestId("value")).toHaveTextContent("3");
  });

  it("clears the value when the chosen name is edited", () => {
    render(<Harness options={interviewers} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByTestId("value")).toHaveTextContent("1");
    fireEvent.change(input(), { target: { value: "Asha R" } });
    expect(screen.getByTestId("value")).toHaveTextContent("");
  });

  it("closes on Escape without letting the key reach a surrounding dialog", () => {
    const onDocKey = vi.fn();
    document.addEventListener("keydown", onDocKey);
    render(<Harness options={interviewers} />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(onDocKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocKey);
  });

  it("shows an empty state when nothing matches", () => {
    render(<Harness options={interviewers} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "zzz" } });
    expect(options()).toEqual([]);
    expect(screen.getByText("No one matches “zzz”.")).toBeInTheDocument();
  });

  it("debounces directory searches and ignores a stale response", async () => {
    vi.useFakeTimers();
    const pending: Record<string, (v: any) => void> = {};
    get.mockImplementation(
      (_url: string, cfg: any) =>
        new Promise((resolve) => {
          pending[cfg?.params?.search ?? ""] = resolve;
        }),
    );
    render(<Harness />);
    fireEvent.focus(input());
    // Typing quickly sends one request for the final text, not one per key.
    for (const v of ["a", "as", "ash"])
      fireEvent.change(input(), { target: { value: v } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    const searches = get.mock.calls.map((c) => c[1]?.params?.search);
    expect(searches.filter((s) => s && s.startsWith("a"))).toEqual(["ash"]);

    // A newer query is answered first; the older one arriving late must not
    // replace it.
    fireEvent.change(input(), { target: { value: "ben" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    await act(async () => {
      pending["ben"]({
        data: {
          data: [
            { id: "2", username: "benito", firstName: "Ben", lastName: "Ito" },
          ],
        },
      });
    });
    await act(async () => {
      pending["ash"]?.({
        data: {
          data: [
            {
              id: "1",
              username: "asharao",
              firstName: "Asha",
              lastName: "Rao",
            },
          ],
        },
      });
    });
    expect(options()).toEqual([expect.stringContaining("Ben Ito")]);
  });

  it("never shows email or phone in suggestions", async () => {
    get.mockResolvedValue({
      data: {
        data: [
          {
            id: "9",
            username: "dnair",
            firstName: "Divya",
            lastName: "Nair",
            email: "divya@example.com",
            mobile: "9999999999",
            designation: "Engineering Manager",
          },
        ],
      },
    });
    render(<Harness />);
    fireEvent.focus(input());
    expect(await screen.findByRole("option")).toHaveTextContent(
      "Divya Nairdnair · Engineering Manager",
    );
    expect(screen.queryByText(/example\.com|9999999999/)).toBeNull();
  });
});
