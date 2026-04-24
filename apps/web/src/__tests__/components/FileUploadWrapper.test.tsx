import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import FileUploadWrapper from "@web/shared/components/FileUploadWrapper";

vi.mock("primereact/fileupload", () => ({
  FileUpload: React.forwardRef(
    (
      { name, accept, className, emptyTemplate, uploadHandler }: any,
      ref: any,
    ) => (
      <div ref={ref} data-testid="file-upload" className={className}>
        <input
          data-testid="file-input"
          type="file"
          name={name}
          accept={accept}
          onChange={(e) => uploadHandler?.({ files: e.target.files })}
        />
        <span>{emptyTemplate}</span>
      </div>
    ),
  ),
}));

const makeFormik = (overrides: any = {}) => ({
  values: { document: "" },
  errors: {},
  touched: {},
  setFieldValue: vi.fn(),
  setFieldTouched: vi.fn(),
  ...overrides,
});

describe("FileUploadWrapper", () => {
  it("renders the file upload component", () => {
    render(
      <FileUploadWrapper
        name="document"
        label="Upload Document"
        formik={makeFormik()}
        fileUploadRef={{ current: null }}
        accept="application/pdf"
      />,
    );
    expect(screen.getByTestId("file-upload")).toBeInTheDocument();
  });

  it("renders the label", () => {
    render(
      <FileUploadWrapper
        name="document"
        label="Upload Document"
        formik={makeFormik()}
        fileUploadRef={{ current: null }}
        accept="application/pdf"
      />,
    );
    expect(screen.getByText("Upload Document")).toBeInTheDocument();
  });

  it("renders drag-and-drop placeholder text", () => {
    render(
      <FileUploadWrapper
        name="document"
        label="Upload"
        formik={makeFormik()}
        fileUploadRef={{ current: null }}
        accept="image/*"
      />,
    );
    expect(
      screen.getByText("Drag and drop file here or click to upload."),
    ).toBeInTheDocument();
  });

  it("shows error when touched and invalid (touched + errors)", () => {
    const formik = makeFormik({
      touched: { document: true },
      errors: { document: "File is required" },
    });
    render(
      <FileUploadWrapper
        name="document"
        label="Upload"
        formik={formik}
        fileUploadRef={{ current: null }}
        accept="*"
      />,
    );
    expect(screen.getByText("File is required")).toBeInTheDocument();
  });

  it("shows error when errors exist even without touched (formik.errors fallback)", () => {
    const formik = makeFormik({
      touched: {},
      errors: { document: "File is required" },
    });
    render(
      <FileUploadWrapper
        name="document"
        label="Upload"
        formik={formik}
        fileUploadRef={{ current: null }}
        accept="*"
      />,
    );
    // FileUploadWrapper checks `formik.errors[name]` directly as fallback
    expect(screen.getByText("File is required")).toBeInTheDocument();
  });

  it("does not show error when no errors exist", () => {
    render(
      <FileUploadWrapper
        name="document"
        label="Upload"
        formik={makeFormik()}
        fileUploadRef={{ current: null }}
        accept="*"
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("applies p-invalid class when there is an error", () => {
    const formik = makeFormik({
      touched: { document: true },
      errors: { document: "Required" },
    });
    render(
      <FileUploadWrapper
        name="document"
        label="Upload"
        formik={formik}
        fileUploadRef={{ current: null }}
        accept="*"
      />,
    );
    expect(screen.getByTestId("file-upload")).toHaveClass("p-invalid");
  });

  it("calls uploadHandler when a file is selected", () => {
    const uploadHandler = vi.fn();
    render(
      <FileUploadWrapper
        name="document"
        label="Upload"
        formik={makeFormik()}
        fileUploadRef={{ current: null }}
        accept="*"
        uploadHandler={uploadHandler}
      />,
    );
    const input = screen.getByTestId("file-input");
    fireEvent.change(input, {
      target: { files: [new File(["content"], "test.pdf")] },
    });
    expect(uploadHandler).toHaveBeenCalled();
  });
});
