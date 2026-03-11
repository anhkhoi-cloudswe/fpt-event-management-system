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
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('Failed to upload image: Not authenticated. Please log in again.')
  }

  const formData = new FormData()
  formData.append('file', file)

  console.log('[S3 Upload] Sending file to backend:', file.name, `(${(file.size / 1024).toFixed(1)} KB)`)

  const response = await fetch('/api/upload/image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
 * Stub: xóa ảnh trên S3 không được thực hiện client-side.
 * Việc xóa cần được làm từ backend (IAM permission) trong tương lai.
 *
 * @param _url - URL ảnh cần xóa (chưa áp dụng)
 */
export async function deleteEventBanner(_url: string): Promise<void> {
  // S3 object deletion requires backend/IAM credentials.
  // Implement a DELETE /api/upload/image?key=... endpoint when needed.
  console.warn('[S3 Upload] deleteEventBanner: server-side deletion not yet implemented')
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
