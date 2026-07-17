import { render, screen, fireEvent } from "@testing-library/react";
import { WorkWeekSection } from "@web/features/settings/org-settings/WorkWeekSection";
import { SCHEMA_DEFAULTS } from "@web/features/settings/org-settings/types";

vi.mock("@web/shared/components/WorkWeekPicker", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@web/shared/components/WorkWeekPicker")
    >();
  return {
    ...actual,
    default: (props: any) => (
      <div>
        <span>disabled={String(props.disabled)}</span>
        <button
          onClick={() =>
            props.onChange({ type: "custom", workingDays: [1, 2, 3, 4, 5, 6] })
          }
        >
          toggle-saturday
        </button>
      </div>
    ),
  };
});

describe("WorkWeekSection", () => {
  it("passes the current work week pattern and readOnly state through to the picker", () => {
    render(
      <WorkWeekSection
        settings={SCHEMA_DEFAULTS}
        onChange={vi.fn()}
        readOnly={true}
      />,
    );
    expect(screen.getByText("disabled=true")).toBeInTheDocument();
  });

  it("forwards picker changes via onChange", () => {
    const onChange = vi.fn();
    render(
      <WorkWeekSection
        settings={SCHEMA_DEFAULTS}
        onChange={onChange}
        readOnly={false}
      />,
    );
    fireEvent.click(screen.getByText("toggle-saturday"));
    expect(onChange).toHaveBeenCalledWith({
      workWeekPattern: { type: "custom", workingDays: [1, 2, 3, 4, 5, 6] },
    });
  });
});
