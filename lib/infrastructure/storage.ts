import fs from 'fs'
import path from 'path'

export interface StoredFile {
  key: string
  url: string
  size: number
  contentType: string
}

export interface StorageService {
  upload(file: Buffer, key: string, contentType: string): Promise<StoredFile>
  delete(key: string): Promise<void>
  getUrl(key: string): Promise<string>
}

export class LocalStorageService implements StorageService {
  private uploadDir: string

  constructor(uploadDir?: string) {
    this.uploadDir = uploadDir || process.env.UPLOAD_DIR || 'public/uploads'
  }

  async upload(file: Buffer, key: string, contentType: string): Promise<StoredFile> {
    const filePath = path.join(this.uploadDir, key)
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, file)
    return {
      key,
      url: `/uploads/${key}`,
      size: file.length,
      contentType,
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key)
    await fs.promises.unlink(filePath).catch(() => {})
  }

  async getUrl(key: string): Promise<string> {
    return `/uploads/${key}`
  }
}

export const localStorageService = new LocalStorageService()
