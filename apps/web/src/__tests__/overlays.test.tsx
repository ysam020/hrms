import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Dialog } from "@next/ui";

beforeEach(() => {
  document.body.innerHTML = '<div id="px-layers"></div>';
});

function Harness() {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <>
      <button onClick={() => setOuter(true)}>open</button>
      <Dialog open={outer} onClose={() => setOuter(false)} title="Outer">
        <button onClick={() => setInner(true)}>nested</button>
        <Dialog open={inner} onClose={() => setInner(false)} title="Inner">
          <input aria-label="inner field" data-autofocus />
        </Dialog>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("locks scroll, traps focus, and Escape closes only the topmost layer", async () => {
    const user = userEvent.setup();
    render(<Harness />, {
      container: document.body.appendChild(document.createElement("div")),
    });

    await user.click(screen.getByText("open"));
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByText("nested"));
    await waitFor(() =>
      expect(screen.getByLabelText("inner field")).toHaveFocus(),
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Inner" })).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();
    // Nested lock is reference-counted: the page stays locked.
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Outer" })).toBeNull(),
    );
    expect(document.body.style.overflow).toBe("");
    // Focus returns to the control that opened it.
    expect(screen.getByText("open")).toHaveFocus();
  });
});
