import { render, screen } from "@testing-library/react";
import { FileTypeIcon } from "@web/features/chat/FileTypeIcon";

describe("FileTypeIcon", () => {
  it("shows a generic file icon when mime is missing", async () => {
    render(<FileTypeIcon mime={undefined} />);
    // First lazy-loaded icon in the file — the dynamic import + on-demand
    // transform can outrun the default 1000ms findBy timeout under load.
    expect(
      await screen.findByTestId("InsertDriveFileIcon", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("shows a PDF icon for application/pdf", async () => {
    render(<FileTypeIcon mime="application/pdf" />);
    expect(await screen.findByTestId("PictureAsPdfIcon")).toBeInTheDocument();
  });

  it.each([
    ["application/vnd.ms-excel", "TableChartIcon"],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "TableChartIcon",
    ],
    ["text/csv", "TableChartIcon"],
  ])("shows a spreadsheet icon for %s", async (mime, testId) => {
    render(<FileTypeIcon mime={mime} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it.each([
    ["application/msword", "ArticleIcon"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "ArticleIcon",
    ],
  ])("shows a document icon for %s", async (mime, testId) => {
    render(<FileTypeIcon mime={mime} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it("shows a video icon for video mime types", async () => {
    render(<FileTypeIcon mime="video/mp4" />);
    expect(await screen.findByTestId("VideoFileIcon")).toBeInTheDocument();
  });

  it("falls back to a generic file icon for an unrecognised mime type", async () => {
    render(<FileTypeIcon mime="application/octet-stream" />);
    expect(
      await screen.findByTestId("InsertDriveFileIcon"),
    ).toBeInTheDocument();
  });
});
