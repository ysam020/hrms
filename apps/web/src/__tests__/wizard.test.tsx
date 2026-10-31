import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import {
  Stepper,
  StepHeader,
  WizardFooter,
  useWizard,
  type WizardStep,
} from "@next/ui";

// The multi-step forms (KYC, job openings) keep all answers in one state
// object and only swap which step is shown.

const STEPS: WizardStep[] = [
  { id: "a", title: "First" },
  { id: "b", title: "Second" },
  { id: "c", title: "Review" },
];

function Harness({
  onSubmit,
  block,
  complete,
}: {
  onSubmit: () => void;
  block?: boolean;
  complete?: number[];
}) {
  const w = useWizard(STEPS.length);
  const [name, setName] = useState("");
  return (
    <form
      id="f"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Stepper
        steps={STEPS}
        current={w.current}
        reached={w.reached}
        onSelect={w.go}
        complete={complete}
      />
      <StepHeader index={w.current} count={3} title={STEPS[w.current].title} />
      {w.current === 0 && (
        <input
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      {w.current === 2 && <p>Name: {name}</p>}
      <WizardFooter
        isFirst={w.isFirst}
        isLast={w.isLast}
        onBack={w.back}
        onContinue={() => !block && w.next()}
        finishLabel="Publish"
        formId="f"
      />
    </form>
  );
}

describe("wizard", () => {
  it("doesn't submit when Continue opens the last step", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps answers when moving between steps", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => {}} />);
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Asha");
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Name: Asha")).toBeInTheDocument();
  });

  it("stays put when the step is invalid, and won't skip ahead", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => {}} block />);
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Review/ })).toBeDisabled();
  });

  it("marks only complete steps as complete", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => {}} complete={[]} />);
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(
      screen.getByRole("button", { name: /First.*incomplete/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
});
