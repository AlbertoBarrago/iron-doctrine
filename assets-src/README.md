# Production assets

Editable, original source art lives here. Runtime code never imports this directory directly.

## Workflow

1. Export a transparent PNG, WebP or SVG sprite sheet into an appropriate `assets-src/`
   subdirectory.
2. Register it in `manifest.json`.
3. Run `pnpm assets:build`.
4. Commit the source, manifest and generated outputs together.
5. Run the full validation pipeline before using a new frame in a painter.

Vite also runs the compiler before development and production builds. Generated files are:

- `apps/client/public/assets/generated/iron-pass.webp`;
- `apps/client/public/assets/generated/iron-pass.json`;
- `apps/client/src/assets/assets.gen.ts`.

Do not edit generated files manually.

## Manifest contract

Each asset defines:

- a stable lowercase `id`;
- a source path contained inside `assets-src/`;
- exact frame width and height;
- ordered directions;
- states with their frame count;
- whether the asset is available to runtime code.

Source frames are ordered by state, then direction, then animation step. The source dimensions must
contain exactly the declared number of frames; unused or implicit frames fail the build.

The compiler sorts assets by ID, packs frames into deterministic shelves, writes a lossless WebP
atlas and emits compile-time frame identifiers. Path traversal, duplicate IDs, malformed grids and
atlas overflow are rejected explicitly.

The technical registration mark validates the pipeline but is marked `runtime: false`. It must
never appear in gameplay.

## Production rules

- Keep editable source files whenever the authoring tool supports them.
- Use transparent backgrounds and the camera/lighting rules in `docs/ART_DIRECTION.md`.
- Do not upscale low-resolution generated imagery into runtime sprites.
- Review silhouettes at normal and minimum gameplay zoom before adding material detail.
- Procedural painters remain the fallback until an entire asset family passes visual acceptance.
