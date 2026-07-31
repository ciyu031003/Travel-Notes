import { z } from 'zod'

export const CreateRepoSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, '名称只能包含字母、数字、下划线和连字符'),
  displayName: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  language: z.string().max(50).optional(),
  stars: z.number().int().min(0).optional(),
  cover: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  repoPath: z.string().min(1).max(500),
})

export const UpdateRepoSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  language: z.string().max(50).optional(),
  stars: z.number().int().min(0).optional(),
  cover: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  repoPath: z.string().min(1).max(500).optional(),
})

export type CreateRepoInput = z.infer<typeof CreateRepoSchema>
export type UpdateRepoInput = z.infer<typeof UpdateRepoSchema>
