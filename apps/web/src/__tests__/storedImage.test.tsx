import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const post = vi.fn();
vi.mock("@next/lib/api", () => ({
  apiClient: { post: (...a: unknown[]) => post(...a) },
}));

import { Avatar } from "@next/ui/display";
import {
  isStoredFileUrl,
  signedFileUrl,
  clearSignedFileUrlCache,
} from "@next/ui/storedImage";

const STORED =
  "https://praesto-189923011190.s3.ap-south-1.amazonaws.com/employee_kyc/employee_photo/asha/photo.jpeg";
const LEGACY =
  "https://praesto.s3.ap-south-1.amazonaws.com/employee_kyc/employee_photo/asha/photo.jpeg";
const SIGNED = `${STORED}?X-Amz-Signature=abc&X-Amz-Expires=300`;

beforeEach(() => {
  post.mockReset();
  clearSignedFileUrlCache();
});

describe("isStoredFileUrl", () => {
  it("matches the uploads buckets only", () => {
    expect(isStoredFileUrl(STORED)).toBe(true);
    expect(isStoredFileUrl(LEGACY)).toBe(true);
    expect(isStoredFileUrl(SIGNED)).toBe(false);
    expect(
      isStoredFileUrl(
        "https://praesto-product-demo-189923011190.s3.ap-south-1.amazonaws.com/a.jpg",
      ),
    ).toBe(false);
    expect(isStoredFileUrl("https://example.com/a.jpg")).toBe(false);
    expect(isStoredFileUrl("/images/a.png")).toBe(false);
  });
});

describe("signedFileUrl", () => {
  it("asks the API once and reuses the answer for a few minutes", async () => {
    post.mockResolvedValue({ data: { data: { url: SIGNED } } });
    expect(await signedFileUrl(STORED, 0)).toBe(SIGNED);
    expect(await signedFileUrl(STORED, 60_000)).toBe(SIGNED);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/upload/view-url", { fileUrl: STORED });
    await signedFileUrl(STORED, 5 * 60_000);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("is null when the file can't be viewed", async () => {
    post.mockRejectedValue(new Error("403"));
    expect(await signedFileUrl(STORED)).toBeNull();
  });
});

describe("Avatar", () => {
  const img = (c: HTMLElement) => c.querySelector("img");

  it("never loads a stored photo directly; shows it through a signed URL", async () => {
    post.mockResolvedValue({ data: { data: { url: SIGNED } } });
    const { container } = render(<Avatar name="Asha Rao" src={STORED} />);
    expect(img(container)).toBeNull();
    expect(screen.getByText("AR")).toBeTruthy();
    await waitFor(() =>
      expect(img(container)?.getAttribute("src")).toBe(SIGNED),
    );
  });

  it("keeps the initials when access is refused or the file is gone", async () => {
    post.mockRejectedValue(new Error("400"));
    const { container } = render(<Avatar name="Asha Rao" src={LEGACY} />);
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(img(container)).toBeNull();
    expect(screen.getByText("AR")).toBeTruthy();
  });

  it("loads other images as they are", () => {
    const { container } = render(<Avatar name="Asha Rao" src="/img/a.png" />);
    expect(img(container)?.getAttribute("src")).toBe("/img/a.png");
    expect(post).not.toHaveBeenCalled();
  });
});
