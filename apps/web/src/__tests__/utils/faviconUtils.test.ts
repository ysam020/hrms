import {
  updateDocumentTitle,
  clearFaviconDot,
  updateFaviconWithDot,
} from "@web/shared/utils/faviconUtils";

// ─── updateDocumentTitle ───────────────────────────────────────────────────

describe("updateDocumentTitle", () => {
  afterEach(() => {
    document.title = "";
  });

  it("sets title to 'HRMS' when notification count is 0", () => {
    updateDocumentTitle(0);
    // jsdom normalises document.title: leading whitespace is stripped
    expect(document.title).toBe("HRMS");
  });

  it("prefixes title with count when count is positive", () => {
    updateDocumentTitle(5);
    // jsdom collapses consecutive whitespace, so "(5) " + " HRMS" → "(5) HRMS"
    expect(document.title).toBe("(5) HRMS");
  });

  it("handles count=1 correctly", () => {
    updateDocumentTitle(1);
    expect(document.title).toBe("(1) HRMS");
  });
});

// ─── clearFaviconDot ──────────────────────────────────────────────────────

describe("clearFaviconDot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.title = "";
  });

  it("resets document.title to 'HRMS' synchronously", () => {
    document.title = "Previous Title";
    clearFaviconDot();
    expect(document.title).toBe("HRMS");
  });

  it("creates a canvas and img element", () => {
    const spy = vi.spyOn(document, "createElement");
    clearFaviconDot();
    expect(spy).toHaveBeenCalledWith("canvas");
    expect(spy).toHaveBeenCalledWith("img");
  });

  it("draws the image on canvas when img loads", () => {
    const mockCtx = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockCtx as any,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,test",
    );

    let capturedImg: HTMLImageElement | null = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag as any);
      if (tag === "img") capturedImg = el as HTMLImageElement;
      return el;
    });

    clearFaviconDot();
    (capturedImg as any)?.onload?.();

    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  it("sets img src to /favicon.ico", () => {
    let capturedImg: HTMLImageElement | null = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag as any);
      if (tag === "img") capturedImg = el as HTMLImageElement;
      return el;
    });

    clearFaviconDot();
    expect(capturedImg?.src).toContain("favicon.ico");
  });
});

// ─── updateFaviconWithDot ─────────────────────────────────────────────────

describe("updateFaviconWithDot", () => {
  let mockCtx: {
    drawImage: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    fillStyle: string;
  };

  const captureImg = (): { getImg: () => HTMLImageElement | null } => {
    let capturedImg: HTMLImageElement | null = null;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag as any);
      if (tag === "img") capturedImg = el as HTMLImageElement;
      return el;
    });
    return { getImg: () => capturedImg };
  };

  beforeEach(() => {
    mockCtx = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockCtx as any,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,test",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the base image on canvas when img loads", () => {
    const { getImg } = captureImg();
    updateFaviconWithDot(false);
    (getImg() as any)?.onload?.();
    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  it("draws a red dot when showDot=true", () => {
    const { getImg } = captureImg();
    updateFaviconWithDot(true);
    (getImg() as any)?.onload?.();

    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      0,
      2 * Math.PI,
    );
    expect(mockCtx.fill).toHaveBeenCalled();
    expect(mockCtx.fillStyle).toBe("#F15C6D");
  });

  it("does not draw a dot when showDot=false", () => {
    const { getImg } = captureImg();
    updateFaviconWithDot(false);
    (getImg() as any)?.onload?.();

    expect(mockCtx.beginPath).not.toHaveBeenCalled();
    expect(mockCtx.arc).not.toHaveBeenCalled();
    expect(mockCtx.fill).not.toHaveBeenCalled();
  });

  it("sets img.src to /favicon.ico", () => {
    const { getImg } = captureImg();
    updateFaviconWithDot(true);
    expect(getImg()?.src).toContain("favicon.ico");
  });

  it("does not throw when onerror fires", () => {
    const { getImg } = captureImg();
    updateFaviconWithDot(true);
    expect(() => (getImg() as any)?.onerror?.()).not.toThrow();
  });

  it("appends a link[rel=icon] element to document.head", () => {
    const { getImg } = captureImg();
    updateFaviconWithDot(true);
    (getImg() as any)?.onload?.();

    const link = document.querySelector("link[rel='icon']");
    expect(link).not.toBeNull();
  });

  it("does nothing when getContext returns null (no ctx guard)", () => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const origCreate = document.createElement.bind(document);
    let capturedImg: HTMLImageElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag as any);
      if (tag === "img") capturedImg = el as HTMLImageElement;
      return el;
    });

    updateFaviconWithDot(true);
    expect(() => (capturedImg as any)?.onload?.()).not.toThrow();
  });
});
