import { handleSameAsPermanentAddress } from "@web/shared/utils/kyc/handleSameAsPermanentAddress";

function makeFormik(values: Record<string, any>) {
  return { values, setValues: vi.fn() };
}

describe("handleSameAsPermanentAddress", () => {
  it("copies every permanent_address_* field into communication_address_* when checked", () => {
    const formik = makeFormik({
      permanent_address_line_1: "123 Main St",
      permanent_address_line_2: "Apt 4",
      permanent_address_city: "Mumbai",
      permanent_address_area: "Andheri",
      permanent_address_state: "MH",
      permanent_address_pincode: "400001",
    });

    handleSameAsPermanentAddress({ target: { checked: true } }, formik);

    expect(formik.setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        communication_address_line_1: "123 Main St",
        communication_address_line_2: "Apt 4",
        communication_address_city: "Mumbai",
        communication_address_area: "Andheri",
        communication_address_state: "MH",
        communication_address_pincode: "400001",
      }),
    );
  });

  it("clears every communication_address_* field when unchecked", () => {
    const formik = makeFormik({
      communication_address_line_1: "Old value",
      communication_address_city: "Old city",
    });

    handleSameAsPermanentAddress({ target: { checked: false } }, formik);

    expect(formik.setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        communication_address_line_1: "",
        communication_address_line_2: "",
        communication_address_city: "",
        communication_address_area: "",
        communication_address_state: "",
        communication_address_pincode: "",
      }),
    );
  });

  it("preserves other unrelated formik values", () => {
    const formik = makeFormik({
      full_name: "Jane Doe",
      permanent_address_city: "Pune",
    });
    handleSameAsPermanentAddress({ target: { checked: true } }, formik);
    expect(formik.setValues).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: "Jane Doe" }),
    );
  });
});
