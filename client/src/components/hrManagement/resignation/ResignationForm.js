import React, { useContext } from "react";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import * as Yup from "yup";
import FormikInputWrapper from "../../customComponents/InputWrapper";

const validationSchema = Yup.object().shape({
  reason: Yup.string()
    .trim()
    .required("Reason is required")
    .min(10, "Please provide a more detailed reason (at least 10 characters)"),
});

function ResignationForm() {
  const { setAlert } = useContext(AlertContext);
  const formik = useFormik({
    initialValues: {
      reason: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.post(`/add-resignation`, values);

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        resetForm();
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      <FormikInputWrapper
        type="text"
        name="reason"
        placeholder="Reason for Resignation"
        formik={formik}
      />

      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(ResignationForm);
