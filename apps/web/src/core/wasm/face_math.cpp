/**
 * face_math.cpp
 *
 * C++ source for the face-recognition math WASM module.
 * The canonical compiled output is face_math.wasm; this file exists so the
 * logic can be read, tested, and recompiled with Emscripten when available.
 *
 * Build (requires Emscripten):
 *   emcc face_math.cpp -O3 \
 *     -s WASM=1 \
 *     -s EXPORTED_FUNCTIONS='["_calculate_head_pose","_euclidean_distance","_max_head_movement","_malloc","_free"]' \
 *     -s EXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
 *     -s MODULARIZE=1 \
 *     -s EXPORT_NAME='createFaceMathModule' \
 *     -s ENVIRONMENT='worker' \
 *     -s ALLOW_MEMORY_GROWTH=1 \
 *     -o face_math_emcc.js
 *
 * For a standalone binary (no Emscripten) the WAT file face_math.wat is the
 * maintained source and is compiled with:
 *   ./node_modules/.bin/wat2wasm src/wasm/face_math.wat -o public/face_math.wasm
 */

#include <cmath>

// ── Helpers ────────────────────────────────────────────────────────────────────

static constexpr float RAD2DEG = 57.29577951f;
static constexpr float HALF_PI = 1.57079632679f;
static constexpr float PI      = 3.14159265358f;

/**
 * Fast atan2 using a Padé approximant for the core atan.
 * Max error < 0.3° – sufficient for head-pose estimation.
 */
static float fast_atan2(float y, float x)
{
    if (x == 0.0f) {
        if (y > 0.0f) return  HALF_PI;
        if (y < 0.0f) return -HALF_PI;
        return 0.0f;
    }

    float r     = y / x;
    float abs_r = std::fabs(r);
    float atan_val;

    if (abs_r <= 1.0f) {
        atan_val = r / (1.0f + 0.28125f * r * r);
    } else {
        float sign = r > 0.0f ? 1.0f : -1.0f;
        atan_val = sign * HALF_PI - r / (r * r + 0.28125f);
    }

    if (x < 0.0f)
        atan_val += (y >= 0.0f) ? PI : -PI;

    return atan_val;
}

// ── Exported functions ─────────────────────────────────────────────────────────

extern "C" {

/**
 * calculate_head_pose
 *
 * Compute three head-pose angles (in degrees) from the 68-point dlib landmark
 * set.
 *
 * @param landmarks  Pointer to 136 floats [x0,y0, x1,y1, … x67,y67].
 * @param out        Pointer to 3  floats  [horizontal, vertical, roll].
 *
 * Key landmark indices:
 *   8  – chin,      30 – nose tip,
 *  36  – left eye,  45 – right eye (outer corners)
 */
void calculate_head_pose(const float* landmarks, float* out)
{
    // Each point occupies 2 floats, so point k starts at index k*2.
    float nose_x  = landmarks[30 * 2],     nose_y  = landmarks[30 * 2 + 1];
    float le_x    = landmarks[36 * 2],     le_y    = landmarks[36 * 2 + 1];
    float re_x    = landmarks[45 * 2],     re_y    = landmarks[45 * 2 + 1];
    float chin_x  = landmarks[ 8 * 2],     chin_y  = landmarks[ 8 * 2 + 1];

    float cx = (le_x + re_x) * 0.5f;
    float cy = (le_y + re_y) * 0.5f;

    out[0] = fast_atan2(nose_x - cx,
                        std::fabs(nose_y - cy) + 1.0f) * RAD2DEG; // horizontal
    out[1] = fast_atan2(chin_y - cy,
                        std::fabs(chin_x - cx) + 1.0f) * RAD2DEG; // vertical
    out[2] = fast_atan2(re_y - le_y, re_x - le_x)      * RAD2DEG; // roll
}

/**
 * euclidean_distance
 *
 * Computes ||a − b||₂ for two float arrays of length n.
 * Used to compare 128-element face-recognition descriptors.
 */
float euclidean_distance(const float* a, const float* b, int n)
{
    float sum = 0.0f;
    for (int i = 0; i < n; ++i) {
        float d = a[i] - b[i];
        sum += d * d;
    }
    return std::sqrt(sum);
}

/**
 * max_head_movement
 *
 * Returns the maximum frame-to-frame Euclidean distance across a sequence of
 * head-pose triples [horizontal, vertical, roll].
 *
 * @param poses  Pointer to count × 3 floats.
 * @param count  Number of pose samples.
 */
float max_head_movement(const float* poses, int count)
{
    float mx = 0.0f;
    for (int i = 1; i < count; ++i) {
        float dh = std::fabs(poses[i*3]     - poses[(i-1)*3]);
        float dv = std::fabs(poses[i*3 + 1] - poses[(i-1)*3 + 1]);
        float dr = std::fabs(poses[i*3 + 2] - poses[(i-1)*3 + 2]);
        float m  = std::sqrt(dh*dh + dv*dv + dr*dr);
        if (m > mx) mx = m;
    }
    return mx;
}

} // extern "C"
