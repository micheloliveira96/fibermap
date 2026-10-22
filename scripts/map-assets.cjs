// MapLibre 6 loads an ESM worker and its sibling shared module at runtime.
// Next/Turbopack must serve both files at stable, same-origin URLs.
const fs = require("node:fs");
const path = require("node:path");
const destination = path.join(__dirname, "../public/vendor/maplibre");
fs.mkdirSync(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  fs.copyFileSync(
    path.join(__dirname, "../node_modules/maplibre-gl/dist", file),
    path.join(destination, file),
  );
}
fs.copyFileSync(
  path.join(__dirname, "../node_modules/maplibre-gl/LICENSE.txt"),
  path.join(destination, "LICENSE.txt"),
);
