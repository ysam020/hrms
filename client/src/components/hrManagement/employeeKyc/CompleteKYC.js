import React, { useEffect, useState, useRef, useContext } from "react";
import { useFormik } from "formik";
import Grid from "@mui/material/Grid2";
import { states } from "../../../assets/data/statesData";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Snackbar from "@mui/material/Snackbar";
import { validationSchema } from "../../../schemas/employeeKyc/completeKyc";
import { useParams } from "react-router-dom";
import CustomButton from "../../customComponents/CustomButton";
import { handleSameAsPermanentAddress } from "../../../utils/kyc/handleSameAsPermanentAddress";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import FormikFileUploadWrapper from "../../customComponents/FileUploadWrapper";
import FormikDropdownWrapper from "../../customComponents/DropdownWrapper";
import { UserContext } from "../../../contexts/UserContext";

function CompleteKYC(props) {
  const [fileSnackbar, setFileSnackbar] = useState(false);
  const { username } = useParams();
  const { user } = useContext(UserContext);

  const fileUploadRefs = useRef({
    employeePhoto: null,
    aadharPhotoFront: null,
    aadharPhotoBack: null,
    panPhoto: null,
    educationCertificates: null,
    experienceCertificate: null,
    electricityBill: null,
    pcc: null,
    draCertificate: null,
  });

  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      employee_photo: "",
      dob: "",
      permanent_address_line_1: "",
      permanent_address_line_2: "",
      permanent_address_city: "",
      permanent_address_state: "",
      permanent_address_pincode: "",
      communication_address_line_1: "",
      communication_address_line_2: "",
      communication_address_city: "",
      communication_address_state: "",
      communication_address_pincode: "",
      email: "",
      official_email: "",
      mobile: "",
      blood_group: "",
      qualification: "",
      aadhar_no: "",
      aadhar_photo_front: "",
      aadhar_photo_back: "",
      pan_no: "",
      pan_photo: "",
      education_certificates: [],
      experience_certificate: "",
      electricity_bill: "",
      pcc: "",
      bank_account_no: "",
      bank_name: "",
      ifsc_code: "",
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        const endpoint = props.edit ? `/edit-kyc` : `/complete-kyc`;

        const res = await apiClient.post(endpoint, {
          ...values,
          username: props.username,
        });

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
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

  useEffect(() => {
    async function getData() {
      if (username) {
        try {
          const res = await apiClient(`/get-user-data/${username}`);

          // Merge API data with initial values to ensure no field becomes undefined
          const mergedData = {};

          // First add all initial values
          Object.keys(formik.initialValues).forEach((key) => {
            mergedData[key] = formik.initialValues[key];
          });

          // Then safely override with API data where it exists
          if (res.data) {
            Object.keys(res.data).forEach((key) => {
              // Special handling for arrays
              if (Array.isArray(formik.initialValues[key])) {
                mergedData[key] = res.data[key] || [];
              }
              // Special handling for booleans
              else if (typeof formik.initialValues[key] === "boolean") {
                mergedData[key] =
                  res.data[key] !== undefined
                    ? Boolean(res.data[key])
                    : formik.initialValues[key];
              }
              // Handle strings and other types
              else if (res.data[key] !== undefined && res.data[key] !== null) {
                mergedData[key] = res.data[key];
              }
              // Keep initial value otherwise (empty string, array, etc.)
            });
          }

          // Set the safely merged values
          formik.setValues(mergedData);
        } catch (error) {
          console.error("Error occurred while fetching user data:", error);
        }
      }
    }

    getData();
    // eslint-disable-next-line
  }, [username]);

  return (
    <form onSubmit={formik.handleSubmit}>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikFileUploadWrapper
            name="employee_photo"
            label="Employee Photo"
            formik={formik}
            fileUploadRef={(el) => (fileUploadRefs.current.employeePhoto = el)}
            accept="image/*"
            setFileSnackbar={setFileSnackbar}
            folderName="employee_kyc"
            username={username || user.username}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="date"
            name="dob"
            placeholder="Date of Birth"
            formik={formik}
            inputProps={{
              showIcon: true,
              showButtonBar: true,
            }}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="email"
            placeholder="Email"
            formik={formik}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="official_email"
            placeholder="Official Email"
            formik={formik}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="mobile"
            placeholder="Mobile"
            formik={formik}
            inputProps={{
              keyfilter: "int",
              maxLength: 10,
              minLength: 10,
            }}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="blood_group"
            placeholder="Blood Group"
            formik={formik}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="qualification"
            placeholder="Highest Qualification"
            formik={formik}
          />
        </Grid>
      </Grid>

      <h5>Permanent Address</h5>
      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="permanent_address_line_1"
            placeholder="Permanent Address Line 1"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="permanent_address_line_2"
            placeholder="Permanent Address Line 2"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="permanent_address_city"
            placeholder="Permanent Address City"
            formik={formik}
          />
        </Grid>

        <Grid size={4}>
          <FormikDropdownWrapper
            name="permanent_address_state"
            options={states}
            placeholder="Permanent Address State"
            formik={formik}
            inputProps={{ optionLabel: "name" }}
          />
        </Grid>

        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="permanent_address_pincode"
            placeholder="Permanent Address PIN Code"
            formik={formik}
            inputProps={{
              keyfilter: "int",
              minLength: 6,
              maxLength: 6,
            }}
          />
        </Grid>
      </Grid>

      <h5>Communication Address</h5>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              name="sameAsPermanentAddress"
              // checked={false}
              onChange={(e) => handleSameAsPermanentAddress(e, formik)}
            />
          }
          label=" Same as Permanent Address"
        />
      </FormGroup>
      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="communication_address_line_1"
            placeholder="Communication Address Line 1"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="communication_address_line_2"
            placeholder="Communication Address Line 2"
            formik={formik}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="communication_address_city"
            placeholder="Communication Address City"
            formik={formik}
          />
        </Grid>

        <Grid size={4}>
          <FormikDropdownWrapper
            name="communication_address_state"
            options={states}
            placeholder="Communication Address State"
            formik={formik}
            inputProps={{ optionLabel: "name" }}
          />
        </Grid>

        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="communication_address_pincode"
            placeholder="Communication Address PIN Code"
            formik={formik}
            inputProps={{
              keyfilter: "int",
              minLength: 6,
              maxLength: 6,
            }}
          />
        </Grid>
      </Grid>
      <h5>Documents</h5>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="aadhar_no"
            placeholder="AADHAR Number"
            formik={formik}
            inputProps={{
              keyfilter: "int",
              minLength: 12,
              maxLength: 12,
            }}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="pan_no"
            placeholder="PAN Number"
            formik={formik}
            inputProps={{
              minLength: 10,
              maxLength: 10,
            }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikFileUploadWrapper
            name="aadhar_photo_front"
            folderName="employee_kyc"
            label="AADHAR Photo Front"
            formik={formik}
            fileUploadRef={(el) =>
              (fileUploadRefs.current.aadharPhotoFront = el)
            }
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            username={username}
          />
        </Grid>

        <Grid size={4}>
          <FormikFileUploadWrapper
            name="aadhar_photo_back"
            folderName="employee_kyc"
            label="AADHAR Photo Back"
            formik={formik}
            fileUploadRef={(el) =>
              (fileUploadRefs.current.aadharPhotoBack = el)
            }
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            username={username}
          />
        </Grid>

        <Grid size={4}>
          <FormikFileUploadWrapper
            name="pan_photo"
            folderName="employee_kyc"
            label="PAN Photo"
            formik={formik}
            fileUploadRef={(el) => (fileUploadRefs.current.panPhoto = el)}
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            username={username}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikFileUploadWrapper
            name="education_certificates"
            folderName="employee_kyc"
            label="Education Certificates"
            formik={formik}
            fileUploadRef={(el) =>
              (fileUploadRefs.current.educationCertificates = el)
            }
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            inputProps={{ multiple: true }}
            username={username}
          />
        </Grid>

        <Grid size={4}>
          <FormikFileUploadWrapper
            name="experience_certificate"
            folderName="employee_kyc"
            label="Experience Certificate / Relieving Letter"
            formik={formik}
            fileUploadRef={(el) =>
              (fileUploadRefs.current.experienceCertificate = el)
            }
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            username={username}
          />
        </Grid>

        <Grid size={4}>
          <FormikFileUploadWrapper
            name="electricity_bill"
            folderName="employee_kyc"
            label="Electricity Bill / Rent Agreement"
            formik={formik}
            fileUploadRef={(el) =>
              (fileUploadRefs.current.electricityBill = el)
            }
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            username={username}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikFileUploadWrapper
            name="pcc"
            folderName="employee_kyc"
            label="PCC"
            formik={formik}
            fileUploadRef={(el) => (fileUploadRefs.current.pcc = el)}
            accept="image/*,application/pdf"
            setFileSnackbar={setFileSnackbar}
            inputProps={{ multiple: true }}
            username={username}
          />
        </Grid>
      </Grid>
      <h5>Bank Details</h5>
      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="bank_account_no"
            placeholder="Bank Account Number"
            formik={formik}
            inputProps={{ keyfilter: "int" }}
          />
        </Grid>

        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="bank_name"
            placeholder="Bank Name"
            formik={formik}
          />
        </Grid>

        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="ifsc_code"
            placeholder="IFSC"
            formik={formik}
          />
        </Grid>
      </Grid>
      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
      <Snackbar
        open={fileSnackbar}
        message="File uploaded successfully!"
        sx={{ left: "auto !important", right: "24px !important" }}
      />
    </form>
  );
}

export default React.memo(CompleteKYC);
