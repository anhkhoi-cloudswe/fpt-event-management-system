// src/pages/ImageUploadTest.tsx - Component test tạm thời
// Mục đích: Test upload / validate / delete ảnh banner lên Supabase Storage

// useState: dùng để lưu state trong component (file chọn, preview, url upload, loading, error...)
import { useState } from 'react'

// Import các hàm tiện ích trong utils/imageUpload:
// - uploadEventBanner: upload ảnh lên Supabase và trả về public URL
// - validateImageFile: validate file ảnh (đuôi, dung lượng...)
// - deleteEventBanner: xóa ảnh trên Supabase (dựa theo URL)
import { uploadEventBanner, validateImageFile, deleteEventBanner } from '../utils/imageUpload'

// Import icon để hiển thị UI đẹp hơn
import { Upload, X, Check, AlertCircle } from 'lucide-react'

export default function ImageUploadTest() {
  // selectedFile: lưu file ảnh người dùng vừa chọn từ máy tính
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // previewUrl: URL tạm để preview ảnh trước khi upload (dùng URL.createObjectURL)
  const [previewUrl, setPreviewUrl] = useState<string>('')

  // uploadedUrl: URL public ảnh sau khi upload thành công lên Supabase
  const [uploadedUrl, setUploadedUrl] = useState<string>('')

  // uploading: cờ loading dùng chung cho upload/delete (đang xử lý)
  const [uploading, setUploading] = useState(false)

  // error: lưu thông báo lỗi để hiển thị UI
  const [error, setError] = useState<string>('')

  // success: lưu thông báo thành công để hiển thị UI
  const [success, setSuccess] = useState<string>('')

  /**
   * handleFileSelect:
   * - Trigger khi user chọn file trong input type="file"
   * - Lấy file đầu tiên e.target.files[0]
   * - Validate file (đuôi ảnh + dung lượng <= 5MB)
   * - Nếu hợp lệ:
   *    + setSelectedFile
   *    + tạo previewUrl để hiển thị ảnh preview
   *    + reset error/success
   * - Nếu lỗi:
   *    + setError
   *    + reset selectedFile và previewUrl
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Lấy file đầu tiên user chọn
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // validateImageFile(file, 5): validate với giới hạn 5MB (tham số 5)
      // Nếu validate fail, hàm có thể throw Error -> nhảy vào catch
      validateImageFile(file, 5)

      // Nếu file ok -> lưu state
      setSelectedFile(file)

      // Tạo URL tạm từ file để preview ngay trên FE
      setPreviewUrl(URL.createObjectURL(file))

      // Reset thông báo
      setError('')
      setSuccess('')
    } catch (err: any) {
      // Nếu validate lỗi -> hiển thị message
      setError(err.message)

      // Reset state liên quan tới file/preview
      setSelectedFile(null)
      setPreviewUrl('')
    }
  }

  /**
   * handleUpload:
   * - Chỉ chạy khi có selectedFile
   * - Set uploading = true, reset message
   * - Gọi uploadEventBanner(file)
   *    + Upload lên Supabase bucket (vd: event-banners)
   *    + Trả về public URL
   * - Set uploadedUrl để hiển thị ảnh đã upload và nút Delete
   */
  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setUploading(true)
      setError('')
      setSuccess('')

      // Upload lên Supabase -> trả về URL public
      const url = await uploadEventBanner(selectedFile)

      // Lưu URL để hiển thị phần "Uploaded Image"
      setUploadedUrl(url)

      // Hiển thị thông báo thành công
      setSuccess(`Upload successful! URL: ${url}`)
    } catch (err: any) {
      // Nếu upload lỗi -> hiển thị message
      setError(err.message || 'Upload failed')
    } finally {
      // Dù thành công hay lỗi -> tắt loading
      setUploading(false)
    }
  }

  /**
   * handleDelete:
   * - Chỉ chạy khi đã có uploadedUrl
   * - Set uploading = true, reset message
   * - Gọi deleteEventBanner(uploadedUrl) để xóa ảnh khỏi Supabase
   * - Xóa xong:
   *    + reset uploadedUrl
   *    + reset selectedFile & previewUrl (vì file không còn)
   *    + hiển thị success
   */
  const handleDelete = async () => {
    if (!uploadedUrl) return

    try {
      setUploading(true)
      setError('')
      setSuccess('')

      // Xóa ảnh trên Supabase (thường parse path từ public URL)
      await deleteEventBanner(uploadedUrl)

      setSuccess('Image deleted successfully!')

      // Reset URL sau khi xóa
      setUploadedUrl('')

      // Reset file + preview
      setSelectedFile(null)
      setPreviewUrl('')
    } catch (err: any) {
      setError(err.message || 'Delete failed')
    } finally {
      setUploading(false)
    }
  }

  /**
   * handleClear:
   * - Dùng để reset toàn bộ state về rỗng
   * - Không liên quan BE/Supabase (chỉ clear FE)
   */
  const handleClear = () => {
    setSelectedFile(null)
    setPreviewUrl('')
    setUploadedUrl('')
    setError('')
    setSuccess('')
  }

  // ====================== RENDER UI ======================
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Banner cảnh báo: đây là trang test tạm thời */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
          <div>
            <p className="text-sm text-yellow-700">
              <strong>Testing Page</strong> - This is a temporary page for testing Supabase image uploads.
            </p>
          </div>
        </div>
      </div>

      {/* Title trang */}
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Image Upload Test
      </h1>

      {/* ================== UPLOAD AREA ================== */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Image</h2>

        <div className="space-y-4">
          {/* ========= FILE INPUT ========= */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Image (Max 5MB, JPG/PNG/GIF/WebP)
            </label>

            <div className="flex items-center gap-3">
              {/* 
                Label đóng vai trò như button "Choose File".
                Input thật bị hidden, click label sẽ trigger input.
              */}
              <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg inline-flex items-center transition-colors">
                <Upload className="w-4 h-4 mr-2" />
                Choose File

                {/* Input chọn file ảnh: accept giới hạn loại file */}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleFileSelect} // khi chọn file -> handleFileSelect
                  className="hidden" // ẩn input
                />
              </label>

              {/* Hiển thị tên file & dung lượng nếu đã chọn */}
              {selectedFile && (
                <span className="text-sm text-gray-600">
                  {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              )}
            </div>
          </div>

          {/* ========= PREVIEW ========= */}
          {/* Nếu có previewUrl -> render ảnh preview */}
          {previewUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview
              </label>
              <div className="relative inline-block">
                <img
                  src={previewUrl} // ảnh preview từ URL.createObjectURL
                  alt="Preview"
                  className="max-w-md w-full h-auto rounded-lg border-2 border-gray-200"
                />
              </div>
            </div>
          )}

          {/* ========= ACTION BUTTONS ========= */}
          <div className="flex gap-3">
            {/* Nút upload: disable nếu chưa chọn file hoặc đang uploading */}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                !selectedFile || uploading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {/* Nếu đang uploading -> đổi text */}
              {uploading ? 'Uploading...' : 'Upload to Supabase'}
            </button>

            {/* Nếu có file và không uploading -> hiện nút Clear để reset */}
            {selectedFile && !uploading && (
              <button
                onClick={handleClear}
                className="px-6 py-2 rounded-lg font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================== SUCCESS MESSAGE ================== */}
      {/* Nếu success có nội dung -> hiển thị box thành công */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <Check className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">Success!</p>
              {/* break-all để URL dài không tràn */}
              <p className="text-sm text-green-700 mt-1 break-all">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================== ERROR MESSAGE ================== */}
      {/* Nếu error có nội dung -> hiển thị box lỗi */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <X className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================== UPLOADED IMAGE ================== */}
      {/* Nếu uploadedUrl tồn tại -> hiển thị ảnh đã upload và nút Delete */}
      {uploadedUrl && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Uploaded Image</h2>

            {/* Nút delete: disable khi uploading */}
            <button
              onClick={handleDelete}
              disabled={uploading}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                uploading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {uploading ? 'Deleting...' : 'Delete from Supabase'}
            </button>
          </div>

          {/* Hiển thị ảnh từ URL public */}
          <div className="mb-4">
            <img
              src={uploadedUrl}
              alt="Uploaded"
              className="max-w-md w-full h-auto rounded-lg border-2 border-gray-200"
            />
          </div>

          {/* Hiển thị URL dạng text để copy */}
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs text-gray-600 font-mono break-all">
              {uploadedUrl}
            </p>
          </div>
        </div>
      )}

      {/* ================== INSTRUCTIONS ================== */}
      {/* Hướng dẫn cấu hình Supabase (dành cho dev) */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Setup Instructions:</h3>

        {/* List hướng dẫn */}
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>
            Create a Supabase project at{' '}
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              supabase.com
            </a>
          </li>

          <li>Create a storage bucket named "event-banners" and set it to public</li>
          <li>Copy your project URL and anon key</li>

          <li>
            Create a <code className="bg-blue-100 px-1 rounded">.env</code> file with:
            <div className="bg-blue-100 rounded p-2 mt-1 font-mono text-xs">
              VITE_SUPABASE_URL=your_url
              <br />
              VITE_SUPABASE_ANON_KEY=your_key
            </div>
          </li>

          <li>Restart the dev server</li>
        </ol>
      </div>
    </div>
  )
}
