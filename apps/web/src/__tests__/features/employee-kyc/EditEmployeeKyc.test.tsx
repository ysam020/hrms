import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import EditEmployeeKyc from "@web/features/employee-kyc/EditEmployeeKyc";

vi.mock("@web/features/employee-kyc/CompleteKYC", () => ({
  default: (props: any) => (
    <div>
      Stub CompleteKYC username={props.username} edit={String(props.edit)}
    </div>
  ),
}));

describe("EditEmployeeKyc", () => {
  it("passes the username route param and edit=true through to CompleteKYC", () => {
    render(
      <MemoryRouter initialEntries={["/kyc/edit/jdoe"]}>
        <Routes>
          <Route path="/kyc/edit/:username" element={<EditEmployeeKyc />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/username=jdoe/)).toBeInTheDocument();
    expect(screen.getByText(/edit=true/)).toBeInTheDocument();
  });
});
