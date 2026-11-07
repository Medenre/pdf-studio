import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "public"), { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm"])
  cpSync(
    resolve(root, "node_modules/pdfjs-dist", name),
    resolve(root, "public", name),
    { recursive: true },
  );
cpSync(
  resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  resolve(root, "public/pdf.worker.min.mjs"),
);
console.log(
  "PDF rendering assets ready (local worker, fonts and character maps).",
);
