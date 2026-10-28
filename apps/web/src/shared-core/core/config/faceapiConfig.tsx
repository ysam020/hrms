import * as faceapi from "face-api.js";

const MODEL_URLS = {
  primary: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/",
  fallback:
    "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/",
};

const MODELS_CONFIG = {
  tinyFaceDetector: {
    name: "tiny_face_detector",
    size: "~400KB",
    load: (url) => faceapi.nets.tinyFaceDetector.loadFromUri(url),
  },
  faceLandmark68: {
    name: "face_landmark_68",
    size: "~350KB",
    load: (url) => faceapi.nets.faceLandmark68Net.loadFromUri(url),
  },
  faceRecognition: {
    name: "face_recognition",
    size: "~6.2MB",
    load: (url) => faceapi.nets.faceRecognitionNet.loadFromUri(url),
  },
  ageGender: {
    name: "age_gender",
    size: "~420KB",
    load: (url) => faceapi.nets.ageGenderNet.loadFromUri(url),
  },
  faceExpression: {
    name: "face_expression",
    size: "~310KB",
    load: (url) => faceapi.nets.faceExpressionNet.loadFromUri(url),
  },
};

// Cache for loaded models
const modelCache = new Map();

export const loadFaceApiModels = async (
  modelsToLoad: string[] | null = null,
  priority: string = "primary",
) => {
  const defaultModels = [
    "tinyFaceDetector",
    "faceLandmark68",
    "faceRecognition",
  ];

  const models = modelsToLoad || defaultModels;
  const modelUrl = MODEL_URLS[priority] || MODEL_URLS.primary;

  try {
    const loadPromises = models.map(async (modelKey) => {
      if (modelCache.has(modelKey)) {
        return true;
      }

      const modelConfig = MODELS_CONFIG[modelKey];
      if (!modelConfig) {
        throw new Error(`Unknown model: ${modelKey}`);
      }

      await modelConfig.load(modelUrl);
      modelCache.set(modelKey, true);

      return true;
    });

    await Promise.all(loadPromises);
    return true;
  } catch (error) {
    console.error("Failed to load Face-API models:", error);

    // Try fallback URL if primary fails
    if (priority === "primary") {
      return await loadFaceApiModels(models, "fallback");
    }

    throw error;
  }
};
