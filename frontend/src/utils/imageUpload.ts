// src/utils/imageUpload.ts
import { supabase } from '../config/supabase'

/**
 * Upload an image file to Supabase storage
 * @param file - The image file to upload
 * @param bucket - The storage bucket name (default: 'user-uploads')
 * @returns The public URL of the uploaded image
 */
export async function uploadEventBanner(
  file: File,
  bucket: string = 'user-uploads'
): Promise<string> {
  try {
    // Generate unique filename
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(7)
    const fileExt = file.name.split('.').pop()
    const fileName = `${timestamp}-${randomString}.${fileExt}`

    console.log('Attempting to upload file to Supabase:', fileName)

    // Upload file to Supabase storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Supabase upload error:', error)
      throw new Error(`Failed to upload image: ${error.message}`)
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    console.log('Upload successful:', publicUrlData.publicUrl)
    return publicUrlData.publicUrl
  } catch (error: any) {
    console.error('Upload failed:', error)
    // Re-throw with more context
    if (error.message?.includes('Failed to fetch')) {
      throw new Error('Failed to upload image: Cannot connect to storage service. Please check your internet connection or try again later.')
    }
    throw new Error(`Failed to upload image: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Delete an image from Supabase storage
 * @param url - The public URL of the image to delete
 * @param bucket - The storage bucket name
 */
export async function deleteEventBanner(
  url: string,
  bucket: string = 'user-uploads'
): Promise<void> {
  // Extract filename from URL
  const urlParts = url.split('/')
  const fileName = urlParts[urlParts.length - 1]

  const { error } = await supabase.storage.from(bucket).remove([fileName])

  if (error) {
    console.error('Delete error:', error)
    throw new Error(`Failed to delete image: ${error.message}`)
  }
}

/**
 * Validate image file
 * @param file - The file to validate
 * @param maxSizeMB - Maximum file size in MB (default: 5)
 * @returns Validation result with valid flag and error message
 */
export function validateImageFile(
  file: File,
  maxSizeMB: number = 5
): { valid: boolean; error?: string } {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload JPG, PNG, GIF, or WebP images.',
    }
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit.`,
    }
  }

  return { valid: true }
}
