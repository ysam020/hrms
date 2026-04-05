// const path = require("path");
// const fs = require("fs");

// async function main() {
//   const wabt = await import("wabt");
//   const wabtMod = await (wabt.default || wabt)();

//   const watPath = path.join(__dirname, "../src/core/wasm/face_math.wat");
//   const wasmPath = path.join(__dirname, "../public/face_math.wasm");

//   const watSource = fs.readFileSync(watPath, "utf8");

//   const module = wabtMod.parseWat("face_math.wat", watSource, {
//     mutable_globals: true,
//     sat_float_to_int: true,
//     sign_extension: true,
//     bulk_memory: false,
//     reference_types: false,
//     exceptions: false,
//     multi_value: false,
//     tail_call: false,
//     gc: false,
//     multi_memory: false,
//     threads: false,
//     simd: false,
//   });

//   const { buffer } = module.toBinary({});
//   fs.writeFileSync(wasmPath, Buffer.from(buffer));

//   module.destroy();
// }

// main().catch((err) => {
//   console.error("[build-wasm] Error:", err.message);
//   process.exit(1);
// });

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const wabt = await import("wabt");
  const wabtMod = await (wabt.default || wabt)();

  const watPath = path.join(__dirname, "../src/core/wasm/face_math.wat");
  const wasmPath = path.join(__dirname, "../public/face_math.wasm");

  const watSource = fs.readFileSync(watPath, "utf8");

  const module = wabtMod.parseWat("face_math.wat", watSource, {
    mutable_globals: true,
    sat_float_to_int: true,
    sign_extension: true,
    bulk_memory: false,
    reference_types: false,
    exceptions: false,
    multi_value: false,
    tail_call: false,
    gc: false,
    multi_memory: false,
    threads: false,
    simd: false,
  });

  const { buffer } = module.toBinary({});
  fs.writeFileSync(wasmPath, Buffer.from(buffer));

  module.destroy();
}

main().catch((err) => {
  console.error("[build-wasm] Error:", err.message);
  process.exit(1);
});
