import { render } from "@testing-library/react";
import ResponsiveImage from "@web/shared/components/ResponsiveImage";

describe("ResponsiveImage", () => {
  it("renders an img element with the correct alt text", () => {
    const { getByAltText } = render(
      <ResponsiveImage src="/images/photo.jpg" alt="Profile photo" />,
    );
    expect(getByAltText("Profile photo")).toBeInTheDocument();
  });

  it("renders a picture element wrapping the img", () => {
    const { container } = render(
      <ResponsiveImage src="/images/photo.jpg" alt="test" />,
    );
    expect(container.querySelector("picture")).toBeInTheDocument();
  });

  it("renders a WebP source for standard images", () => {
    const { container } = render(
      <ResponsiveImage src="/images/photo.jpg" alt="test" />,
    );
    const source = container.querySelector("source[type='image/webp']");
    expect(source).toBeInTheDocument();
    expect(source?.getAttribute("srcset")).toContain(".webp");
  });

  it("generates thumb variant for employee_photo images", () => {
    const { container } = render(
      <ResponsiveImage src="/uploads/employee_photo.jpg" alt="employee" />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("-thumb");
  });

  it("generates small variant for logo images", () => {
    const { container } = render(
      <ResponsiveImage src="/assets/logo.png" alt="logo" />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("-small");
  });

  it("falls back to original src when no extension found", () => {
    const { getByAltText } = render(
      <ResponsiveImage src="/images/photo-no-ext" alt="no ext" />,
    );
    expect(getByAltText("no ext")).toHaveAttribute(
      "src",
      "/images/photo-no-ext",
    );
  });

  it("handles null/undefined src gracefully", () => {
    const { getByAltText } = render(
      <ResponsiveImage src={null} alt="null image" />,
    );
    expect(getByAltText("null image")).toBeInTheDocument();
  });

  it("defaults to lazy loading", () => {
    const { getByAltText } = render(
      <ResponsiveImage src="/images/photo.jpg" alt="lazy" />,
    );
    expect(getByAltText("lazy")).toHaveAttribute("loading", "lazy");
  });

  it("respects eager loading when specified", () => {
    const { getByAltText } = render(
      <ResponsiveImage src="/images/photo.jpg" alt="eager" loading="eager" />,
    );
    expect(getByAltText("eager")).toHaveAttribute("loading", "eager");
  });

  it("passes width and height to img", () => {
    const { getByAltText } = render(
      <ResponsiveImage
        src="/images/photo.jpg"
        alt="sized"
        width={100}
        height={100}
      />,
    );
    expect(getByAltText("sized")).toHaveAttribute("width", "100");
    expect(getByAltText("sized")).toHaveAttribute("height", "100");
  });
});
