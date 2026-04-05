import { FileUpload } from "primereact/fileupload";
import React from "react";

function FileUploadWrapper({
  name,
  label,
  formik,
  fileUploadRef,
  accept,
  setFileSnackbar: _setFileSnackbar,
  folderName: _folderName,
  username: _username,
  uploadHandler,
  setAlert: _setAlert,
  maxFileSize = 0,
  inputProps: _inputProps = undefined,
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

  return (
    <div className="form-field-container">
      <label htmlFor={name}>{label}</label>
      <FileUpload
        ref={fileUploadRef}
        name={name}
        customUpload
        uploadHandler={uploadHandler}
        accept={accept}
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
