const loadFromUri = vi.hoisted(() => ({
  tinyFaceDetector: vi.fn(),
  faceLandmark68Net: vi.fn(),
  faceRecognitionNet: vi.fn(),
  ageGenderNet: vi.fn(),
  faceExpressionNet: vi.fn(),
}));

vi.mock("face-api.js", () => ({
  nets: {
    tinyFaceDetector: { loadFromUri: loadFromUri.tinyFaceDetector },
    faceLandmark68Net: { loadFromUri: loadFromUri.faceLandmark68Net },
    faceRecognitionNet: { loadFromUri: loadFromUri.faceRecognitionNet },
    ageGenderNet: { loadFromUri: loadFromUri.ageGenderNet },
    faceExpressionNet: { loadFromUri: loadFromUri.faceExpressionNet },
  },
}));

describe("loadFaceApiModels", () => {
  let loadFaceApiModels: typeof import("@web/core/config/faceapiConfig").loadFaceApiModels;

  // The module keeps a module-level `modelCache` singleton, so each test needs
  // a fresh module instance to avoid one test's cached model masking another's.
  beforeEach(async () => {
    Object.values(loadFromUri).forEach((fn) => fn.mockReset());
    vi.resetModules();
    ({ loadFaceApiModels } = await import("@web/core/config/faceapiConfig"));
  });

  it("loads the default three models from the primary CDN", async () => {
    Object.values(loadFromUri).forEach((fn) => fn.mockResolvedValue(undefined));

    const result = await loadFaceApiModels();

    expect(result).toBe(true);
    expect(loadFromUri.tinyFaceDetector).toHaveBeenCalledWith(
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/",
    );
    expect(loadFromUri.faceLandmark68Net).toHaveBeenCalled();
    expect(loadFromUri.faceRecognitionNet).toHaveBeenCalled();
    expect(loadFromUri.ageGenderNet).not.toHaveBeenCalled();
  });

  it("loads only the requested models", async () => {
    loadFromUri.ageGenderNet.mockResolvedValue(undefined);

    await loadFaceApiModels(["ageGender"]);

    expect(loadFromUri.ageGenderNet).toHaveBeenCalled();
    expect(loadFromUri.tinyFaceDetector).not.toHaveBeenCalled();
  });

  it("throws for an unrecognized model key", async () => {
    await expect(loadFaceApiModels(["notARealModel"])).rejects.toThrow(
      "Unknown model: notARealModel",
    );
  });

  it("does not re-fetch a model that was already loaded (cached)", async () => {
    loadFromUri.ageGenderNet.mockResolvedValue(undefined);
    await loadFaceApiModels(["ageGender"]);
    expect(loadFromUri.ageGenderNet).toHaveBeenCalledTimes(1);

    await loadFaceApiModels(["ageGender"]);
    expect(loadFromUri.ageGenderNet).toHaveBeenCalledTimes(1);
  });

  it("falls back to the alternate CDN when the primary URL fails", async () => {
    loadFromUri.faceExpressionNet
      .mockRejectedValueOnce(new Error("primary CDN down"))
      .mockResolvedValueOnce(undefined);

    const result = await loadFaceApiModels(["faceExpression"]);

    expect(result).toBe(true);
    expect(loadFromUri.faceExpressionNet).toHaveBeenNthCalledWith(
      1,
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/",
    );
    expect(loadFromUri.faceExpressionNet).toHaveBeenNthCalledWith(
      2,
      "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/",
    );
  });

  it("throws when both the primary and fallback CDNs fail", async () => {
    loadFromUri.faceExpressionNet.mockRejectedValue(new Error("down"));

    await expect(loadFaceApiModels(["faceExpression"])).rejects.toThrow("down");
  });
});
