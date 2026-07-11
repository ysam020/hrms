import { FileUpload } from "primereact/fileupload";
import { memo, useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import handleFileUpload from "@web/shared/utils/handleFileUpload";

const isImageUrl = (url: string) =>
  /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(url);
const isPdfUrl = (url: string) => /\.pdf$/i.test(url);

function filenameFromUrl(url: string) {
  try {
    return decodeURIComponent(url.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

const tileSx = {
  width: 72,
  height: 72,
  borderRadius: 1,
  border: "1px solid",
  borderColor: "divider",
} as const;

// Uploaded KYC files live in a private S3 bucket (aadhar/PAN/bank proofs
// aren't public) — the raw fileUrl stored on the record 403s if loaded
// directly, so every preview fetches a short-lived signed URL first.
function FilePreview({ url }: { url: string }) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setViewUrl(null);
    setFailed(false);
    apiClient
      .post(API_ENDPOINTS.UPLOAD_VIEW_URL, { fileUrl: url })
      .then((res) => {
        if (!cancelled) setViewUrl(res.data?.data?.url ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;

  if (!viewUrl) {
    return (
      <Box
        sx={{
          ...tileSx,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "action.hover",
        }}
        title={filenameFromUrl(url)}
      >
        {failed ? (
          <BrokenImageIcon fontSize="small" color="disabled" />
        ) : (
          <CircularProgress size={20} />
        )}
      </Box>
    );
  }

  return (
    <a
      href={viewUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={filenameFromUrl(url)}
      style={{ display: "block" }}
    >
      {isImageUrl(url) ? (
        <Box
          component="img"
          src={viewUrl}
          alt="Uploaded preview"
          sx={{ ...tileSx, objectFit: "cover" }}
        />
      ) : (
        <Box
          sx={{
            ...tileSx,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.25,
            bgcolor: "action.hover",
          }}
        >
          <PictureAsPdfIcon
            fontSize="small"
            color={isPdfUrl(url) ? "error" : "action"}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.6rem",
              px: 0.5,
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "100%",
            }}
          >
            {isPdfUrl(url) ? "PDF" : "View file"}
          </Typography>
        </Box>
      )}
    </a>
  );
}

function FileUploadWrapper({
  name,
  label,
  formik,
  fileUploadRef,
  accept,
  setFileSnackbar,
  folderName,
  username,
  uploadHandler,
  setAlert,
  maxFileSize = 0,
  inputProps = undefined,
  revisionNote,
}: {
  name: any;
  label: any;
  formik: any;
  fileUploadRef: any;
  accept: any;
  setFileSnackbar?: any;
  folderName?: any;
  username?: any;
  uploadHandler?: (e: any) => void;
  setAlert?: (alert: any) => void;
  maxFileSize?: number;
  inputProps?: any;
  revisionNote?: string;
}) {
  const hasError =
    (formik.touched[name] && formik.errors[name]) || formik.errors[name];

  const currentValue = formik.values[name];
  const previewUrls: string[] = Array.isArray(currentValue)
    ? currentValue.filter(Boolean)
    : currentValue
      ? [currentValue]
      : [];

  const internalUploadHandler = useCallback(
    (e: any) =>
      handleFileUpload(
        e,
        formik,
        name,
        folderName,
        setFileSnackbar,
        inputProps?.multiple ?? false,
        setAlert,
        username,
      ),
    [
      formik,
      name,
      folderName,
      setFileSnackbar,
      setAlert,
      username,
      inputProps?.multiple,
    ],
  );

  return (
    <div className="form-field-container">
      <label htmlFor={name}>{label}</label>
      <FileUpload
        ref={fileUploadRef}
        name={name}
        customUpload
        uploadHandler={uploadHandler ?? internalUploadHandler}
        accept={accept}
        multiple={inputProps?.multiple ?? false}
        maxFileSize={maxFileSize * 1024 * 1024}
        className={hasError ? "p-invalid" : ""}
        emptyTemplate={<p>Drag and drop file here or click to upload.</p>}
        {...({ onBlur: () => formik.setFieldTouched(name, true) } as any)}
      />
      {previewUrls.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
          {previewUrls.map((url) => (
            <FilePreview key={url} url={url} />
          ))}
        </Box>
      )}
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
      {!hasError && revisionNote && (
        <small style={{ display: "block", color: "#b45309" }} role="alert">
          ⚠ {revisionNote}
        </small>
      )}
    </div>
  );
}

export default memo(FileUploadWrapper);
