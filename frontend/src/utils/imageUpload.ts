// src/utils/imageUpload.ts
// Đã migration: Supabase → AWS S3 (thông qua Backend endpoint /api/upload/image)
// Zero-Waste: upload chỉ xảy ra sau khi JWT hợp lệ được xác nhận bởng backend

/**
 * Upload một file ảnh lên AWS S3 thông qua backend endpoint.
 *
 * Quy trình Zero-Waste:
 *  1. Frontend gửi file đến POST /api/upload/image (có JWT trong header)
 *  2. Backend xác thực JWT, kiểm tra role, validate file
 *  3. Chỉ khi pass backend validation mới upload lên S3
 *  4. Trả về S3 URL dạng: https://{bucket}.s3.{region}.amazonaws.com/{key}
 *
 * @param file - File ảnh cần upload
 * @returns URL công khai của ảnh trên S3
 */
export async function uploadEventBanner(file: File): Promise<string> {
  if (!file) {
    throw new Error('Failed to upload image: No file provided.')
  }

  const formData = new FormData()
  formData.append('file', file)

  console.log('[S3 Upload] Sending file to backend:', file.name, `(${(file.size / 1024).toFixed(1)} KB)`)

  const response = await fetch('/api/upload/image', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = data?.message || `HTTP ${response.status}`
    console.error('[S3 Upload] Backend returned error:', message)
    throw new Error(`Failed to upload image: ${message}`)
  }

  if (!data.url) {
    throw new Error('Failed to upload image: Backend did not return a URL')
  }

  console.log('[S3 Upload] Success:', data.url)
  return data.url as string
}

/**
 * Xóa ảnh trên S3 thông qua backend endpoint.
 *
 * @param url - URL ảnh cần xóa
 */
export async function deleteEventBanner(url: string): Promise<void> {
  if (!url) return
  console.log('[S3 Upload] Deleting file via backend:', url)
  try {
    const response = await fetch('/api/upload/image', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ url }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = data?.message || `HTTP ${response.status}`
      console.error('[S3 Upload] Backend returned error deleting image:', message)
    } else {
      console.log('[S3 Upload] Successfully deleted image:', url)
    }
  } catch (err) {
    console.error('[S3 Upload] Error deleting image:', err)
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
