import { render, screen, fireEvent } from "@testing-library/react";
import { TenantPicker } from "@web/features/auth/org-setup/TenantPicker";

const TENANTS = [
  { id: "t1", name: "Acme Corp", slug: "acme", role: "Admin" },
  { id: "t2", name: "Globex", slug: "globex", role: "Employee" },
];

describe("TenantPicker", () => {
  it("renders each tenant's name, slug, and role", () => {
    render(
      <TenantPicker tenants={TENANTS} loading={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByText("Employee")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked tenant's id", () => {
    const onSelect = vi.fn();
    render(
      <TenantPicker tenants={TENANTS} loading={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("Globex"));
    expect(onSelect).toHaveBeenCalledWith("t2");
  });

  it("disables all tenant buttons while loading", () => {
    render(
      <TenantPicker tenants={TENANTS} loading={true} onSelect={vi.fn()} />,
    );
    screen.getAllByRole("button").forEach((btn) => expect(btn).toBeDisabled());
  });
});
