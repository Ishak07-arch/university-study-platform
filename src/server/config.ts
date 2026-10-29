import path from "node:path";

// Server-only storage root. Tests override this to preserve development data.
export function dataDirectory(...parts: string[]) {
  return path.resolve(
    process.env.FOLIO_DATA_DIR || path.join(process.cwd(), ".data"),
    ...parts,
  );
}
