/**
 * 存储抽象：本地文件系统（默认）或 S3 兼容对象存储（MinIO / Cloudflare R2 / 阿里云 OSS）。
 * 配置 STORAGE_ENDPOINT + STORAGE_ACCESS_KEY + STORAGE_SECRET_KEY + STORAGE_BUCKET 后自动启用对象存储。
 */
import fs from 'fs'
import path from 'path'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'

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

/** S3 兼容对象存储（MinIO / R2 / OSS） */
export class S3StorageService implements StorageService {
  private client: S3Client
  private bucket: string
  private publicBaseUrl: string

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT
    const accessKey = process.env.STORAGE_ACCESS_KEY
    const secretKey = process.env.STORAGE_SECRET_KEY
    const bucket = process.env.STORAGE_BUCKET

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      throw new Error('[S3StorageService] 缺少 STORAGE_* 环境变量配置')
    }

    this.bucket = bucket
    this.publicBaseUrl = (process.env.STORAGE_PUBLIC_BASE_URL || endpoint).replace(/\/+$/, '')

    this.client = new S3Client({
      endpoint,
      region: process.env.STORAGE_REGION || 'auto',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true,
    })
  }

  async upload(file: Buffer, key: string, contentType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: contentType,
      })
    )
    return {
      key,
      url: `${this.publicBaseUrl}/${key}`,
      size: file.length,
      contentType,
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    )
  }

  async getUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${key}`
  }

  /** 生成安全随机对象键 */
  static makeKey(prefix: string, ext: string): string {
    const rand = Math.random().toString(36).slice(2, 10)
    const ts = Date.now()
    return `${prefix}/${ts}-${rand}.${ext}`
  }
}

let storageServiceInstance: StorageService | null = null

/** 返回全局存储服务：配置了 STORAGE_* 时使用对象存储，否则使用本地文件系统 */
export function getStorageService(): StorageService {
  if (storageServiceInstance) return storageServiceInstance

  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
    storageServiceInstance = new S3StorageService()
  } else {
    storageServiceInstance = localStorageService
  }
  return storageServiceInstance
}
