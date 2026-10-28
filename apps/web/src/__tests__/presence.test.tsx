import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { useState } from "react";
import { Collapse, Presence } from "@next/motion";

// Shorten animations so lifecycle can be asserted quickly but still async.
MotionGlobalConfig.skipAnimations = false;

function Toggle({ initial = false }: { initial?: boolean }) {
  const [show, setShow] = useState(initial);
  return (
    <>
      <button onClick={() => setShow((v) => !v)}>toggle</button>
      <Presence show={show} variant="rise">
        <div>
          <button>inside</button>
        </div>
      </Presence>
    </>
  );
}

describe("Presence", () => {
  it("mounts on show, stays mounted and inert while exiting, then unmounts", async () => {
    const user = userEvent.setup();
    render(<Toggle />);
    expect(screen.queryByText("inside")).toBeNull();

    await user.click(screen.getByText("toggle"));
    expect(screen.getByText("inside")).toBeInTheDocument();

    await user.click(screen.getByText("toggle"));
    // Exit has started: still in the DOM, but not interactive.
    const wrapper = screen.getByText("inside").closest("[inert]");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("aria-hidden", "true");

    await waitFor(() => expect(screen.queryByText("inside")).toBeNull());
  });

  it("re-showing during the exit reverses the same element instead of duplicating it", async () => {
    const user = userEvent.setup();
    render(<Toggle initial />);
    await user.click(screen.getByText("toggle")); // start exit
    await user.click(screen.getByText("toggle")); // re-show mid-exit
    expect(screen.getAllByText("inside")).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByText("inside").closest("[inert]")).toBeNull(),
    );
  });

  it("survives rapid toggling without leaking nodes", async () => {
    const user = userEvent.setup();
    render(<Toggle />);
    for (let i = 0; i < 9; i++) await user.click(screen.getByText("toggle"));
    // Odd number of toggles → shown, exactly once.
    await waitFor(() => expect(screen.getAllByText("inside")).toHaveLength(1));
    await user.click(screen.getByText("toggle"));
    await waitFor(() => expect(screen.queryByText("inside")).toBeNull());
  });
});

describe("Collapse", () => {
  it("removes hidden content from the tab order by unmounting it", async () => {
    function C() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>disclose</button>
          <Collapse open={open}>
            <input aria-label="advanced" />
          </Collapse>
        </>
      );
    }
    const user = userEvent.setup();
    render(<C />);
    expect(screen.getByLabelText("advanced")).toBeInTheDocument();
    await user.click(screen.getByText("disclose"));
    await waitFor(() => expect(screen.queryByLabelText("advanced")).toBeNull());
    await act(async () => {});
  });
});
