/**
 * KidSchedule – Local Storage Adapter
 *
 * File storage implementation using Node.js filesystem.
 * Stores files in ./public/moments/ with UUID-based unique names.
 * Public URLs are accessible via Next.js static file serving.
 */

import { promises as fs } from "fs";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import type { StorageAdapter } from "./types";

export interface LocalStorageConfig {
  storagePath: string;
  baseUrl: string;
}

export function createLocalStorageAdapter(config: LocalStorageConfig): StorageAdapter {
  return {
    async upload(file: Buffer, filename: string, contentType: string) {
      // Extract file extension from original filename
      const ext = filename.includes(".")
        ? filename.substring(filename.lastIndexOf("."))
        : getExtensionFromMimeType(contentType);

      // Generate unique filename: UUID + original extension
      const uniqueFilename = `${uuidv4()}${ext}`;
      const storagePath = `${config.storagePath}/${uniqueFilename}`;

      // Ensure directory exists
      await fs.mkdir(dirname(storagePath), { recursive: true });

      // Write to temporary file first, then rename for atomicity
      const tempPath = `${storagePath}.tmp`;
      await fs.writeFile(tempPath, file);
      await fs.rename(tempPath, storagePath);

      // Return public URL and storage path
      const publicUrl = `${config.baseUrl}${uniqueFilename}`;
      return {
        url: publicUrl,
        path: storagePath,
      };
    },

    async delete(path: string) {
      try {
        await fs.unlink(path);
      } catch (error) {
        // Silently ignore if file doesn't exist
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    },
  };
}

/**
 * Map common MIME types to file extensions.
 */
function getExtensionFromMimeType(contentType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "video/mp4": ".mp4",
  };
  return mimeToExt[contentType] || ".bin";
}
