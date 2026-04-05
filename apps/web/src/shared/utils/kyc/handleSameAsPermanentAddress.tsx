export const handleSameAsPermanentAddress = (event, formik) => {
  if (event.target.checked) {
    formik.setValues({
      ...formik.values,
      communication_address_line_1: formik.values?.permanent_address_line_1,
      communication_address_line_2: formik.values?.permanent_address_line_2,
      communication_address_city: formik.values?.permanent_address_city,
      communication_address_area: formik.values?.permanent_address_area,
      communication_address_state: formik.values?.permanent_address_state,
      communication_address_pincode: formik.values?.permanent_address_pincode,
    });
  } else {
    // If unchecked, clear all communication address fields
    formik.setValues({
      ...formik.values,
      communication_address_line_1: "",
      communication_address_line_2: "",
      communication_address_city: "",
      communication_address_area: "",
      communication_address_state: "",
      communication_address_pincode: "",
    });
  }
};
