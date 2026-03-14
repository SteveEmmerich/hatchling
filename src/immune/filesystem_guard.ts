import { PathGuard } from "../system/pathGuard.js";

export interface FilesystemValidationResult {
  ok: boolean;
  resolvedPath?: string;
  reason?: string;
}

export function validateFilesystemAccess(
  rootDir: string,
  requestedPath: string,
  op: "read" | "write" = "read",
): Promise<FilesystemValidationResult> {
  PathGuard.setRoot(rootDir);
  return PathGuard.validatePath(requestedPath, op)
    .then((resolvedPath) => ({ ok: true, resolvedPath }))
    .catch((error) => ({
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }));
}
