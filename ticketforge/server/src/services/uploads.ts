import fs from "fs";
import path from "path";
import multer, { MulterError } from "multer";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// Ensure folder exists
export function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {}
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const base = safeName(file.originalname || "file");
    const stamp = Date.now();
    cb(null, `${stamp}__${base}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB cap to avoid DOS-size uploads
    files: 10
  }
});

// Centralized Multer error -> JSON
export function multerErrorHandler(err: any, _req: any, res: any, next: any) {
  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  return next(err);
}
