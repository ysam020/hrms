import { FileUpload } from "primereact/fileupload";
import React from "react";
import { AlertContext } from "../../contexts/AlertContext";
import handleFileUpload from "../../utils/handleFileUpload";

function FileUploadWrapper({
  name,
  label,
  formik,
  fileUploadRef,
  accept,
  setFileSnackbar,
  folderName,
  username,
}) {
  const { setAlert } = React.useContext(AlertContext);
  const hasError =
    (formik.touched[name] && formik.errors[name]) || formik.errors[name];

  return (
    <div className="form-field-container">
      <label htmlFor={name}>{label}</label>
      <FileUpload
        ref={fileUploadRef}
        name={name}
        customUpload
        uploadHandler={(e) =>
          handleFileUpload(
            e,
            formik,
            name,
            folderName,
            setFileSnackbar,
            false,
            setAlert,
            username
          )
        }
        accept={accept}
        maxFileSize={0.5 * 1024 * 1024} // 0.5MB
        className={hasError ? "p-invalid" : ""}
        emptyTemplate={<p>Drag and drop file here or click to upload.</p>}
        onBlur={() => formik.setFieldTouched(name, true)}
      />
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
}

export default React.memo(FileUploadWrapper);
