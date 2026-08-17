'use client'

import { useState } from 'react'

export interface PostFormData {
  title: string
  slug: string
  content: string
  date: string
  cover: string
  images: string[]
  videos: Array<{ url: string; thumbnail?: string; duration?: number }>
  tags: string
  location: string
  type: string
  summary: string
  published: boolean
  isPublic: boolean
}

const getDefaultFormData = (): PostFormData => ({
  title: '',
  slug: '',
  content: '',
  date: new Date().toISOString().split('T')[0],
  cover: '',
  images: [],
  videos: [],
  tags: '',
  location: '',
  type: 'travel',
  summary: '',
  published: true,
  isPublic: false,
})

export function usePostForm(initial?: Partial<PostFormData>) {
  const [formData, setFormData] = useState<PostFormData>(() => ({
    ...getDefaultFormData(),
    ...initial,
  }))

  const setField = <K extends keyof PostFormData>(field: K, value: PostFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const reset = () => {
    setFormData(getDefaultFormData())
  }

  return {
    formData,
    setFormData,
    setField,
    reset,
  }
}
