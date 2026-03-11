/**
 * KidSchedule – Storage Adapter Interface
 *
 * Defines the contract for file storage backends (local, S3, GCS, etc.).
 * Implementations handle uploading, storing, and deleting files with unique
 * identifiers and public URLs.
 */

export interface StorageAdapter {
  /**
   * Upload a file to storage.
   * @param file - File contents as Buffer
   * @param filename - Original filename (used for extension extraction)
   * @param contentType - MIME type (e.g., 'image/jpeg', 'video/mp4')
   * @returns Promise resolving to {url, path} where url is public-accessible
   */
  upload(file: Buffer, filename: string, contentType: string): Promise<{
    url: string;
    path: string;
  }>;

  /**
   * Delete a file from storage.
   * @param path - Storage path returned from upload()
   * @returns Promise resolving when file is deleted
   */
  delete(path: string): Promise<void>;
}
