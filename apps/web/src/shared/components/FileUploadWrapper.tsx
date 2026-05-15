import { FileUpload } from "primereact/fileupload";
import React, { useCallback } from "react";
import handleFileUpload from "@web/shared/utils/handleFileUpload";

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
}) {
  const hasError =
    (formik.touched[name] && formik.errors[name]) || formik.errors[name];

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
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
}

export default React.memo(FileUploadWrapper);
