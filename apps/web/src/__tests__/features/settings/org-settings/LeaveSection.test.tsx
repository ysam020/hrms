import { render, screen, fireEvent, within } from "@testing-library/react";
import { LeaveSection } from "@web/features/settings/org-settings/LeaveSection";
import {
  SCHEMA_DEFAULTS,
  EMPTY_LEAVE_POLICY,
  type LeavePolicy,
} from "@web/features/settings/org-settings/types";

async function chooseOption(combobox: HTMLElement, optionText: string) {
  fireEvent.mouseDown(combobox);
  fireEvent.click(await screen.findByRole("option", { name: optionText }));
}

function renderSection(
  overrides: Partial<any> = {},
  onChange = vi.fn(),
  readOnly = false,
) {
  render(
    <LeaveSection
      settings={{ ...SCHEMA_DEFAULTS, ...overrides }}
      onChange={onChange}
      readOnly={readOnly}
    />,
  );
  return { onChange };
}

function policy(overrides: Partial<LeavePolicy> = {}): LeavePolicy {
  return {
    ...EMPTY_LEAVE_POLICY,
    key: "ML",
    name: "Maternity Leave",
    daysPerYear: 90,
    ...overrides,
  };
}

describe("LeaveSection — basic quotas", () => {
  it("shows and updates the three built-in quotas", () => {
    const { onChange } = renderSection({ paidLeavesPerYear: 12 });
    expect(screen.getByLabelText("Paid Leaves / year")).toHaveValue(12);
    fireEvent.change(screen.getByLabelText("Sick Leaves / year"), {
      target: { value: "15" },
    });
    expect(onChange).toHaveBeenCalledWith({ sickLeavesPerYear: 15 });
  });

  it("toggles the medical certificate requirement", () => {
    const { onChange } = renderSection({ medicalCertRequired: false });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Require a medical certificate/ }),
    );
    expect(onChange).toHaveBeenCalledWith({ medicalCertRequired: true });
  });
});

describe("LeaveSection — custom leave types", () => {
  it("hides the new-type form for a read-only user", () => {
    renderSection({}, vi.fn(), true);
    expect(
      screen.queryByPlaceholderText("Maternity Leave"),
    ).not.toBeInTheDocument();
  });

  it("disables Add until both name and key are entered", () => {
    renderSection();
    expect(
      screen.getByText("Add", { selector: "span" }).closest("button"),
    ).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Maternity Leave"), {
      target: { value: "Maternity" },
    });
    expect(
      screen.getByText("Add", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });

  it("adds a custom type with an uppercased key and resets the form", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByPlaceholderText("Maternity Leave"), {
      target: { value: "Maternity" },
    });
    fireEvent.change(screen.getByPlaceholderText("ML"), {
      target: { value: "ml" },
    });
    fireEvent.click(screen.getByText("Add", { selector: "span" }));

    expect(onChange).toHaveBeenCalledWith({
      customLeaveTypes: [
        { name: "Maternity", key: "ML", daysPerYear: 10, requiresProof: false },
      ],
    });
  });

  it("formats a chip with days and a proof-required note when applicable", () => {
    renderSection({
      customLeaveTypes: [
        { name: "Maternity", key: "ML", daysPerYear: 90, requiresProof: true },
      ],
    });
    expect(
      screen.getByText("Maternity (ML) · 90d · proof req."),
    ).toBeInTheDocument();
  });

  it("removes a custom type by deleting its chip", () => {
    const { onChange } = renderSection({
      customLeaveTypes: [
        { name: "Maternity", key: "ML", daysPerYear: 90, requiresProof: false },
      ],
    });
    fireEvent.click(screen.getByTestId("CancelIcon"));
    expect(onChange).toHaveBeenCalledWith({ customLeaveTypes: [] });
  });
});

describe("LeaveSection — advanced policy editor", () => {
  it("shows an empty-state message with no advanced policies configured", () => {
    renderSection({ leavePolicies: [] });
    expect(
      screen.getByText("No advanced policy configured yet."),
    ).toBeInTheDocument();
  });

  it("shows badges for statutory, comp-off, carry-forward, and encashment", () => {
    renderSection({
      leavePolicies: [
        policy({
          isStatutory: true,
          isCompOff: true,
          carryForward: { enabled: true, maxDays: 5, expiryMonths: 3 },
          encashment: { enabled: true, ratePerDay: 500, maxDaysPerYear: 10 },
        }),
      ],
    });
    expect(screen.getByText("Statutory")).toBeInTheDocument();
    expect(screen.getByText("Comp-off")).toBeInTheDocument();
    expect(screen.getByText("Carry-forward")).toBeInTheDocument();
    expect(screen.getByText("Encashable")).toBeInTheDocument();
  });

  it("shows 'unlimited' fallback for carry-forward maxDays when unset", () => {
    renderSection({
      leavePolicies: [
        policy({
          carryForward: { enabled: true, maxDays: null, expiryMonths: null },
        }),
      ],
    });
    expect(
      screen.getByText(/Carry-forward: up to unlimited days/),
    ).toBeInTheDocument();
  });

  it("maps each onExhaustion value to its description", () => {
    const { rerender } = render(
      <LeaveSection
        settings={{
          ...SCHEMA_DEFAULTS,
          leavePolicies: [policy({ onExhaustion: "reject" })],
        }}
        onChange={vi.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByText(/block the application/)).toBeInTheDocument();

    rerender(
      <LeaveSection
        settings={{
          ...SCHEMA_DEFAULTS,
          leavePolicies: [policy({ onExhaustion: "auto_lop" })],
        }}
        onChange={vi.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByText(/allow as loss-of-pay/)).toBeInTheDocument();
  });

  it("hides Edit/Remove for a read-only user", () => {
    renderSection({ leavePolicies: [policy()] }, vi.fn(), true);
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Add advanced policy", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("disables Add/Update until name, key, and daysPerYear are set", () => {
    renderSection({ leavePolicies: [] });
    fireEvent.click(
      screen.getByText("Add advanced policy", { selector: "span" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText("Add", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });

  it("adds a new advanced policy with an uppercased key", async () => {
    const { onChange } = renderSection({ leavePolicies: [] });
    fireEvent.click(
      screen.getByText("Add advanced policy", { selector: "span" }),
    );
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.change(dialog.getByLabelText("Name"), {
      target: { value: "Paternity Leave" },
    });
    fireEvent.change(dialog.getByLabelText("Key"), { target: { value: "pl" } });
    fireEvent.change(dialog.getByLabelText("Days / year"), {
      target: { value: "15" },
    });
    fireEvent.click(dialog.getByText("Add", { selector: "span" }));

    expect(onChange).toHaveBeenCalledWith({
      leavePolicies: [
        expect.objectContaining({
          name: "Paternity Leave",
          key: "PL",
          daysPerYear: 15,
        }),
      ],
    });
  });

  it("reveals comp-off/carry-forward/encashment sub-fields only once their switch is on", () => {
    renderSection({ leavePolicies: [] });
    fireEvent.click(
      screen.getByText("Add advanced policy", { selector: "span" }),
    );
    const dialog = within(screen.getByRole("dialog"));

    expect(
      dialog.queryByLabelText("Comp-off expires after"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      dialog.getByRole("checkbox", { name: "This is a comp-off type" }),
    );
    expect(dialog.getByLabelText("Comp-off expires after")).toBeInTheDocument();

    expect(dialog.queryByLabelText("Max days")).not.toBeInTheDocument();
    fireEvent.click(
      dialog.getByRole("checkbox", { name: "Carry-forward to next year" }),
    );
    expect(dialog.getByLabelText("Max days")).toBeInTheDocument();

    expect(dialog.queryByLabelText("Rate per day")).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Allow encashment" }));
    expect(dialog.getByLabelText("Rate per day")).toBeInTheDocument();
  });

  it("edits an existing policy, prefilling its values, updating in place", async () => {
    const { onChange } = renderSection({
      leavePolicies: [
        policy({ key: "ML", name: "Maternity Leave", daysPerYear: 90 }),
      ],
    });

    fireEvent.click(screen.getByLabelText("Edit"));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Name")).toHaveValue("Maternity Leave");

    fireEvent.change(dialog.getByLabelText("Days / year"), {
      target: { value: "120" },
    });
    fireEvent.click(dialog.getByText("Update", { selector: "span" }));

    expect(onChange).toHaveBeenCalledWith({
      leavePolicies: [expect.objectContaining({ key: "ML", daysPerYear: 120 })],
    });
  });

  it("changes the accrual method via its select", async () => {
    renderSection({ leavePolicies: [policy({ accrualMethod: "lump_sum" })] });
    fireEvent.click(screen.getByLabelText("Edit"));
    const dialog = within(screen.getByRole("dialog"));

    const accrualSelect = dialog.getAllByRole("combobox")[0];
    await chooseOption(accrualSelect, "Accrued monthly");
    expect(accrualSelect).toHaveTextContent("Accrued monthly");
  });

  it("removes an advanced policy", () => {
    const { onChange } = renderSection({
      leavePolicies: [policy({ key: "ML" })],
    });
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(onChange).toHaveBeenCalledWith({ leavePolicies: [] });
  });
});
