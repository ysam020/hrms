import { useRef, useContext, useEffect, memo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Grid from "@mui/material/Grid2";
import Person from "@mui/icons-material/Person";
import Home from "@mui/icons-material/Home";
import ContactMail from "@mui/icons-material/ContactMail";
import Assignment from "@mui/icons-material/Assignment";
import AccountBalance from "@mui/icons-material/AccountBalance";
import VerifiedUser from "@mui/icons-material/VerifiedUser";
import { useFormik } from "formik";
import { states } from "@web/assets/data/statesData";
import { validationSchema } from "./schemas";
import { useParams } from "react-router-dom";
import Button from "@web/shared/components/Button";
import { handleSameAsPermanentAddress } from "@web/shared/utils/kyc/handleSameAsPermanentAddress";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import FormikFileUploadWrapper from "@web/shared/components/FileUploadWrapper";
import FormikDropdownWrapper from "@web/shared/components/DropdownWrapper";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants";

function CompleteKYC(props) {
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
  });

  const { setAlert } = useContext(AlertContext);

  const onFileUploaded = (uploaded: boolean) => {
    if (uploaded)
      setAlert({
        open: true,
        message: "File uploaded successfully!",
        severity: "success",
      });
  };

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
      bank_account_no: "",
      bank_name: "",
      ifsc_code: "",
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        const endpoint = props.edit
          ? API_ENDPOINTS.EDIT_KYC
          : API_ENDPOINTS.COMPLETE_KYC;

        const res = await (props.edit ? apiClient.put : apiClient.post)(
          endpoint,
          { ...values, username: props.username },
        );

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        if (props.edit) {
          // Editing an existing employee's KYC: keep showing what was just
          // saved. formik.resetForm() reverts to the blank `initialValues`
          // (never updated to the fetched data — only formik.values was, via
          // setValues in the effect below), which wiped the whole form.
          formik.resetForm({ values: formik.values });
        } else {
          formik.resetForm();
        }
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

  // Fetch user data
  const { data: userData, loading } = useFetchData(
    username ? `/get-user-data/${username}` : null,
    "get",
    [username],
    null,
    null,
  );

  // Update formik values when user data is fetched
  useEffect(() => {
    if (userData && !loading) {
      const mergedData = {};

      // Start with initial values
      Object.keys(formik.initialValues).forEach((key) => {
        mergedData[key] = formik.initialValues[key];
      });

      // Merge with fetched user data
      Object.keys(userData).forEach((key) => {
        if (Array.isArray(formik.initialValues[key])) {
          mergedData[key] = userData[key] || [];
        } else if (typeof formik.initialValues[key] === "boolean") {
          mergedData[key] =
            userData[key] !== undefined
              ? Boolean(userData[key])
              : formik.initialValues[key];
        } else if (userData[key] !== undefined && userData[key] !== null) {
          mergedData[key] = userData[key];
        }
      });

      formik.setValues(mergedData as any);
    }
  }, [userData, loading]);

  const revisionNotes: Record<string, string> =
    userData?.kyc_revision_notes ?? {};
  const needsRevision =
    userData?.kyc_approval === "Revision Requested" &&
    Object.keys(revisionNotes).length > 0;

  // Editing is only reachable via this component with props.edit — the
  // original self-onboarding "Complete KYC" flow (props.edit falsy) is
  // unaffected, since a brand-new submission has no prior decision to
  // protect.
  const isLocked =
    props.edit &&
    ["Approved", "Rejected", "Edit Requested"].includes(userData?.kyc_approval);

  if (!loading && isLocked) {
    return (
      <Card sx={{ maxWidth: 1000, mx: "auto", boxShadow: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <VerifiedUser color="primary" />
            <Typography variant="h6" fontWeight="600">
              Complete KYC
            </Typography>
          </Box>
          <Alert severity="info">
            {userData?.kyc_approval === "Edit Requested"
              ? "An edit request is pending HR's approval. You'll be able to make changes once it's granted."
              : "This KYC is already finalized and can't be edited directly. Request an update from the KYC details page to make changes."}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: 1000, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <VerifiedUser color="primary" />
          <Typography variant="h6" fontWeight="600">
            Complete KYC
          </Typography>
        </Box>

        {needsRevision && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              HR requested a revision on the fields marked below
            </Typography>
            <Typography variant="body2">
              Update them and resubmit — everything else stays as-is.
            </Typography>
          </Alert>
        )}

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Personal Information */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Person sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Personal Information
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="employee_photo"
                      label="Employee Photo"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.employeePhoto = el)
                      }
                      accept="image/*"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      folderName="employee_kyc"
                      username={username || user.username}
                      revisionNote={revisionNotes.employee_photo}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="date"
                      name="dob"
                      placeholder="Date of Birth"
                      formik={formik}
                      revisionNote={revisionNotes.dob}
                      inputProps={{
                        showIcon: true,
                        showButtonBar: true,
                        maxDate: new Date(),
                        minDate: new Date("1900-01-01"),
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="mobile"
                      placeholder="Mobile"
                      formik={formik}
                      revisionNote={revisionNotes.mobile}
                      inputProps={{
                        keyfilter: "int",
                        maxLength: 10,
                        minLength: 10,
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="email"
                      placeholder="Email"
                      formik={formik}
                      revisionNote={revisionNotes.email}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="official_email"
                      placeholder="Official Email"
                      formik={formik}
                      revisionNote={revisionNotes.official_email}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="blood_group"
                      placeholder="Blood Group"
                      formik={formik}
                      revisionNote={revisionNotes.blood_group}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="qualification"
                      placeholder="Highest Qualification"
                      formik={formik}
                      revisionNote={revisionNotes.qualification}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Permanent Address */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Home sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Permanent Address
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="permanent_address_line_1"
                      placeholder="Address Line 1"
                      formik={formik}
                      revisionNote={revisionNotes.permanent_address_line_1}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="permanent_address_line_2"
                      placeholder="Address Line 2"
                      formik={formik}
                      revisionNote={revisionNotes.permanent_address_line_2}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="permanent_address_city"
                      placeholder="City"
                      formik={formik}
                      revisionNote={revisionNotes.permanent_address_city}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikDropdownWrapper
                      name="permanent_address_state"
                      options={states}
                      placeholder="State"
                      formik={formik}
                      revisionNote={revisionNotes.permanent_address_state}
                      inputProps={{ optionLabel: "name" }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="permanent_address_pincode"
                      placeholder="PIN Code"
                      formik={formik}
                      revisionNote={revisionNotes.permanent_address_pincode}
                      inputProps={{
                        keyfilter: "int",
                        minLength: 6,
                        maxLength: 6,
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Communication Address */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <ContactMail sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Communication Address
                  </Typography>
                </Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      name="sameAsPermanentAddress"
                      onChange={(e) => handleSameAsPermanentAddress(e, formik)}
                    />
                  }
                  label="Same as Permanent Address"
                  sx={{ mb: 1 }}
                />
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="communication_address_line_1"
                      placeholder="Address Line 1"
                      formik={formik}
                      revisionNote={revisionNotes.communication_address_line_1}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="communication_address_line_2"
                      placeholder="Address Line 2"
                      formik={formik}
                      revisionNote={revisionNotes.communication_address_line_2}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="communication_address_city"
                      placeholder="City"
                      formik={formik}
                      revisionNote={revisionNotes.communication_address_city}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikDropdownWrapper
                      name="communication_address_state"
                      options={states}
                      placeholder="State"
                      formik={formik}
                      revisionNote={revisionNotes.communication_address_state}
                      inputProps={{ optionLabel: "name" }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikInputWrapper
                      type="text"
                      name="communication_address_pincode"
                      placeholder="PIN Code"
                      formik={formik}
                      revisionNote={revisionNotes.communication_address_pincode}
                      inputProps={{
                        keyfilter: "int",
                        minLength: 6,
                        maxLength: 6,
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Documents */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Assignment sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Documents
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="aadhar_no"
                      placeholder="AADHAR Number"
                      formik={formik}
                      revisionNote={revisionNotes.aadhar_no}
                      inputProps={{
                        keyfilter: "int",
                        minLength: 12,
                        maxLength: 12,
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="pan_no"
                      placeholder="PAN Number"
                      formik={formik}
                      revisionNote={revisionNotes.pan_no}
                      inputProps={{
                        minLength: 10,
                        maxLength: 10,
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="aadhar_photo_front"
                      folderName="employee_kyc"
                      label="AADHAR Front"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.aadharPhotoFront = el)
                      }
                      accept="image/*,application/pdf"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      username={username || user.username}
                      revisionNote={revisionNotes.aadhar_photo_front}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="aadhar_photo_back"
                      folderName="employee_kyc"
                      label="AADHAR Back"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.aadharPhotoBack = el)
                      }
                      accept="image/*,application/pdf"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      username={username || user.username}
                      revisionNote={revisionNotes.aadhar_photo_back}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="pan_photo"
                      folderName="employee_kyc"
                      label="PAN Card"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.panPhoto = el)
                      }
                      accept="image/*,application/pdf"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      username={username || user.username}
                      revisionNote={revisionNotes.pan_photo}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="education_certificates"
                      folderName="employee_kyc"
                      label="Education Certificates"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.educationCertificates = el)
                      }
                      accept="image/*,application/pdf"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      inputProps={{ multiple: true }}
                      username={username || user.username}
                      revisionNote={revisionNotes.education_certificates}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="experience_certificate"
                      folderName="employee_kyc"
                      label="Experience Certificate"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.experienceCertificate = el)
                      }
                      accept="image/*,application/pdf"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      username={username || user.username}
                      revisionNote={revisionNotes.experience_certificate}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormikFileUploadWrapper
                      name="electricity_bill"
                      folderName="employee_kyc"
                      label="Address Proof"
                      formik={formik}
                      fileUploadRef={(el) =>
                        (fileUploadRefs.current.electricityBill = el)
                      }
                      accept="image/*,application/pdf"
                      setFileSnackbar={onFileUploaded}
                      setAlert={setAlert}
                      username={username || user.username}
                      revisionNote={revisionNotes.electricity_bill}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Bank Details */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <AccountBalance
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Bank Details
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="bank_account_no"
                      placeholder="Bank Account Number"
                      formik={formik}
                      revisionNote={revisionNotes.bank_account_no}
                      inputProps={{ keyfilter: "int" }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="bank_name"
                      placeholder="Bank Name"
                      formik={formik}
                      revisionNote={revisionNotes.bank_name}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="ifsc_code"
                      placeholder="IFSC Code"
                      formik={formik}
                      revisionNote={revisionNotes.ifsc_code}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Submit */}
            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  sx={{
                    minWidth: 160,
                    textTransform: "none",
                    fontWeight: "500",
                  }}
                >
                  Submit KYC
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default memo(CompleteKYC);
