import { memo, useCallback, useContext, useRef, useState } from "react";
import axios from "axios";
import Box from "@mui/material/Box";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { FileUpload } from "primereact/fileupload";
import ThemedDialog from "@web/shared/components/ThemedDialog";
import Button from "@web/shared/components/Button";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { AlertContext } from "@web/app/providers/AlertContext";

// Browsers/OSes disagree on what MIME type a .csv file carries — mirrors the
// accepted set in apps/api-gateway/src/handlers/onboardingImport.ts.
const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
  "text/plain",
]);

interface ValidationError {
  sheetName: string;
  row: number;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  summary: { sheetName: string; rows: number; errors: number }[];
  errors: ValidationError[];
}

interface CommitResult {
  created: { row: number; email: string; userId: string }[];
  failed: { row: number; email: string; message: string }[];
}

const STEPS = ["Upload", "Review", "Done"];

function BulkImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "downloading" | "uploading" | "committing"
  >("idle");
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const fileUploadRef = useRef<FileUpload>(null);

  const isBusy = phase !== "idle";

  const reset = useCallback(() => {
    setStep(0);
    setPhase("idle");
    setUploadedKey(null);
    setValidationResult(null);
    setCommitResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const downloadTemplate = useCallback(async () => {
    setPhase("downloading");
    try {
      const response = await apiClient(API_ENDPOINTS.BULK_ONBOARDING_TEMPLATE, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "employee-onboarding-template.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      // responseType "blob" means error responses are blobs too, not JSON —
      // the real message has to be read back out of the blob body.
      let message = "Failed to download template";
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          message = JSON.parse(text)?.message || message;
        } catch {
          // fall through to default message
        }
      } else {
        message = error.response?.data?.message || message;
      }
      setAlert({ open: true, message, severity: "error" });
    } finally {
      setPhase("idle");
    }
  }, [setAlert]);

  const uploadHandler = useCallback(
    async (event: any) => {
      const file = event.files?.[0];
      event.options?.clear?.();
      if (!file) return;

      if (
        !file.name.toLowerCase().endsWith(".csv") ||
        // An empty file.type is common for .csv specifically (some OS/browser
        // combinations don't populate it at all) — don't reject on that alone,
        // the extension check above already gates the common mistake.
        (file.type && !CSV_MIME_TYPES.has(file.type))
      ) {
        setAlert({
          open: true,
          message: "Only .csv files are accepted",
          severity: "error",
        });
        return;
      }

      setPhase("uploading");
      try {
        const { data: presignedRes } = await apiClient.post(
          API_ENDPOINTS.BULK_ONBOARDING_UPLOAD_URL,
          { fileName: file.name, fileType: file.type },
        );
        const { url, key } = presignedRes.data;

        // PUT straight to S3 with the raw axios client — the presigned URL
        // is itself the auth mechanism and must not carry the app's own
        // Authorization header (mirrors handleFileUpload.tsx).
        await axios.put(url, file, {
          headers: { "Content-Type": file.type },
        });

        const { data: validateRes } = await apiClient.post(
          API_ENDPOINTS.BULK_ONBOARDING_VALIDATE,
          { key },
        );

        setUploadedKey(key);
        setValidationResult(validateRes.data);
        setStep(1);
      } catch (error: any) {
        setAlert({
          open: true,
          message:
            error.response?.data?.message ||
            "Failed to upload and validate the file",
          severity: "error",
        });
      } finally {
        setPhase("idle");
      }
    },
    [setAlert],
  );

  const handleCommit = useCallback(async () => {
    if (!uploadedKey) return;
    setPhase("committing");
    try {
      const { data: commitRes } = await apiClient.post(
        API_ENDPOINTS.BULK_ONBOARDING_COMMIT,
        { key: uploadedKey },
      );
      setCommitResult(commitRes.data);
      setStep(2);
      if (commitRes.data.created.length > 0) onImported();
    } catch (error: any) {
      const errData = error.response?.data;
      if (errData?.data?.errors) {
        // commit re-validates before writing — this means the workbook is
        // no longer clean (e.g. another import landed in between). Show the
        // fresh errors the same way the initial validation does.
        setValidationResult(errData.data);
        setStep(1);
      }
      setAlert({
        open: true,
        message: errData?.message || "Failed to import employees",
        severity: "error",
      });
    } finally {
      setPhase("idle");
    }
  }, [uploadedKey, onImported, setAlert]);

  const errorRows = validationResult?.errors ?? [];

  return (
    <ThemedDialog
      open={open}
      onClose={handleClose}
      title="Bulk Import Employees"
      showCloseButton
      maxWidth="md"
      actions={
        <>
          {step === 1 && !validationResult?.valid && (
            <Button onClick={reset} disabled={isBusy} variant="secondary">
              Upload a different file
            </Button>
          )}
          {step === 1 && validationResult?.valid && (
            <Button
              onClick={handleCommit}
              disabled={isBusy}
              loading={phase === "committing"}
              loadingText="Importing..."
            >
              Import Employees
            </Button>
          )}
          {step === 2 && <Button onClick={handleClose}>Close</Button>}
          {step !== 2 && (
            <Button onClick={handleClose} disabled={isBusy} variant="secondary">
              Cancel
            </Button>
          )}
        </>
      }
    >
      <Stepper activeStep={step} sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {step === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Download the template, fill in employee details, then upload the
            completed CSV file below.
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              icon={<DownloadIcon aria-hidden="true" />}
              onClick={downloadTemplate}
              disabled={isBusy}
              loading={phase === "downloading"}
              loadingText="Downloading..."
            >
              Download Template
            </Button>
            <Button
              icon={<UploadFileIcon aria-hidden="true" />}
              onClick={() => fileUploadRef.current?.getInput()?.click()}
              disabled={isBusy}
            >
              Choose File
            </Button>
          </Box>
          {/* Header (Choose/Upload/Cancel) replaced with just the hidden
              choose button — it still needs to render (unstyled, off-screen)
              so its native file input mounts and getInput() below has
              something to click; the visible trigger is the "Choose File"
              button above, styled with our own Button instead of PrimeReact's. */}
          <FileUpload
            ref={fileUploadRef}
            customUpload
            auto
            uploadHandler={uploadHandler}
            accept=".csv"
            multiple={false}
            maxFileSize={
              (Number(import.meta.env.VITE_MAX_FILE_SIZE) || 15) * 1024 * 1024
            }
            headerTemplate={(options) => (
              <div style={{ display: "none" }}>{options.chooseButton}</div>
            )}
            emptyTemplate={
              <p>
                Drag and drop the completed template here, or use "Choose File"
                above.
              </p>
            }
            disabled={isBusy}
          />
          {phase === "uploading" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Uploading and validating…
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {step === 1 && validationResult && (
        <Box>
          {validationResult.valid ? (
            <Typography variant="body2">
              {validationResult.summary[0]?.rows ?? 0} employees ready to
              import.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {validationResult.summary[0]?.rows ?? 0} rows,{" "}
                {errorRows.length} error{errorRows.length === 1 ? "" : "s"} —
                fix these in the workbook and upload again.
              </Typography>
              <TableContainer sx={{ maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell width={80}>Row</TableCell>
                      <TableCell>Issue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {errorRows.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell>{e.row || "—"}</TableCell>
                        <TableCell>{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      )}

      {step === 2 && commitResult && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <CheckCircleIcon color="success" aria-hidden="true" />
            <Typography variant="body2">
              {commitResult.created.length} employee
              {commitResult.created.length === 1 ? "" : "s"} imported
              {commitResult.failed.length > 0
                ? `, ${commitResult.failed.length} failed`
                : ""}
              .
            </Typography>
          </Box>
          {commitResult.failed.length > 0 && (
            <TableContainer sx={{ maxHeight: 280 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={80}>Row</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {commitResult.failed.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell>{f.row}</TableCell>
                      <TableCell>{f.email}</TableCell>
                      <TableCell>{f.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    </ThemedDialog>
  );
}

export default memo(BulkImportDialog);
