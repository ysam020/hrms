import handleFileUpload from "@web/shared/utils/handleFileUpload";
import apiClient from "@web/core/http/axiosConfig";
import axios from "axios";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn() },
}));

vi.mock("axios", () => ({
  default: { put: vi.fn() },
}));

const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = axios.put as unknown as ReturnType<typeof vi.fn>;

function makeFile(name: string, size: number, type = "application/pdf") {
  const file = new File(["x".repeat(Math.max(size, 1))], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function makeEvent(files: File[]) {
  return { files, options: { clear: vi.fn() } };
}

function makeFormik() {
  return { setValues: vi.fn((updater: any) => updater({})) };
}

describe("handleFileUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_MAX_FILE_SIZE", "15"); // 15MB
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows an error and does nothing when no files are selected", async () => {
    const setAlert = vi.fn();
    await handleFileUpload(
      makeEvent([]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("No file selected"),
      }),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("clears the file input options regardless of outcome", async () => {
    const event = makeEvent([]);
    await handleFileUpload(
      event,
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      vi.fn(),
      "u1",
    );
    expect(event.options.clear).toHaveBeenCalled();
  });

  it("rejects a file that exceeds the configured max size", async () => {
    const setAlert = vi.fn();
    const file = makeFile("big.pdf", 20 * 1024 * 1024); // 20MB > 15MB limit
    await handleFileUpload(
      makeEvent([file]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("exceeds the 15MB limit"),
      }),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("rejects an empty (0-byte) file", async () => {
    const setAlert = vi.fn();
    const file = makeFile("empty.pdf", 0);
    await handleFileUpload(
      makeEvent([file]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("is empty") }),
    );
  });

  it("uploads via presigned URL, sets the formik field, and shows success", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: { url: "https://s3/put-url", fileUrl: "https://s3/file.pdf" },
      },
    });
    mockPut.mockResolvedValue({});
    const setFileSnackbar = vi.fn();
    const setAlert = vi.fn();
    const formik = makeFormik();
    const file = makeFile("doc.pdf", 1024);

    await handleFileUpload(
      makeEvent([file]),
      formik,
      "resume",
      "resumes",
      setFileSnackbar,
      false,
      setAlert,
      "u1",
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fileName: "doc.pdf",
        folder: "resumes",
        formikField: "resume",
        username: "u1",
      }),
    );
    expect(mockPut).toHaveBeenCalledWith("https://s3/put-url", file, {
      headers: { "Content-Type": "application/pdf" },
    });
    expect(formik.setValues).toHaveBeenCalled();
    expect(setFileSnackbar).toHaveBeenCalledWith(true);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "File uploaded successfully!",
      }),
    );
  });

  it("sets the formik field to an array when multiple is true", async () => {
    mockPost
      .mockResolvedValueOnce({
        data: { data: { url: "u1", fileUrl: "file1.pdf" } },
      })
      .mockResolvedValueOnce({
        data: { data: { url: "u2", fileUrl: "file2.pdf" } },
      });
    mockPut.mockResolvedValue({});
    let capturedValues: any = null;
    const formik = {
      setValues: (updater: any) => (capturedValues = updater({})),
    };
    const files = [makeFile("a.pdf", 100), makeFile("b.pdf", 100)];

    await handleFileUpload(
      makeEvent(files),
      formik,
      "docs",
      "folder",
      vi.fn(),
      true,
      vi.fn(),
      "u1",
    );

    expect(capturedValues.docs).toEqual(["file1.pdf", "file2.pdf"]);
  });

  it("maps a virus-detection server error to a security alert message", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Virus detected in file" } },
    });
    const setAlert = vi.fn();
    const file = makeFile("bad.pdf", 100);

    await handleFileUpload(
      makeEvent([file]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("malware and has been quarantined"),
      }),
    );
  });

  it("maps a path-traversal server error to an invalid-filename message", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Path traversal attempt detected" } },
    });
    const setAlert = vi.fn();
    await handleFileUpload(
      makeEvent([makeFile("../../etc/passwd", 100)]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Invalid filename detected"),
      }),
    );
  });

  it("maps a quarantine server error to a warning severity", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "File has been quarantined" } },
    });
    const setAlert = vi.fn();
    await handleFileUpload(
      makeEvent([makeFile("f.pdf", 100)]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
  });

  it("falls back to a generic upload-error message when the server gives no message", async () => {
    mockPost.mockRejectedValue(new Error("network down"));
    const setAlert = vi.fn();
    await handleFileUpload(
      makeEvent([makeFile("f.pdf", 100)]),
      makeFormik(),
      "field",
      "folder",
      vi.fn(),
      false,
      setAlert,
      "u1",
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Error uploading file(s). Please try again.",
      }),
    );
  });
});
