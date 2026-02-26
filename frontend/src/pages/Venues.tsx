/**
 * =============================================================================
 * TRANG QUẢN LÝ ĐỊA ĐIỂM (VENUES)
 * =============================================================================
 * 
 * TỔNG QUAN LUỒNG CHẠY:
 * 1. Khi trang được load -> useEffect gọi fetchVenues() để lấy danh sách địa điểm từ API
 * 2. Người dùng có thể tìm kiếm địa điểm qua ô search
 * 3. Người dùng có thể thêm/sửa/xóa địa điểm (Venue)
 * 4. Khi chọn một địa điểm -> hiển thị danh sách các phòng (Area) của địa điểm đó
 * 5. Người dùng có thể thêm/sửa/xóa phòng trong địa điểm đã chọn
 * 
 * CẤU TRÚC DỮ LIỆU:
 * - Venue (Địa điểm): venueId, venueName, address, areas[]
 * - Area (Phòng): areaId, venueId, areaName, floor, capacity, status
 * =============================================================================
 */

// Import các hooks cần thiết từ React
import { useState, useEffect } from 'react'
// Import các icon từ thư viện lucide-react
import { PlusCircle, Building2, Search } from 'lucide-react'
// Import các types và services để gọi API
import { Venue, Area, venueService, areaService } from '../services/venueService'
// Import các components con
import VenueList from '../components/venues/VenueList'
import VenueFormModal from '../components/venues/VenueFormModal'
import AreaListSection from '../components/venues/AreaListSection'
import AreaFormModal from '../components/venues/AreaFormModal'
// Import hook để hiển thị thông báo toast
import { useToast } from '../contexts/ToastContext'
// Import component modal xác nhận xóa
import ConfirmModal from '../components/common/ConfirmModal'

export default function Venues() {
  // ==========================================================================
  // KHAI BÁO CÁC STATE
  // ==========================================================================

  // State lưu từ khóa tìm kiếm địa điểm
  const [search, setSearch] = useState('')
  // State lưu danh sách tất cả địa điểm
  const [venues, setVenues] = useState<Venue[]>([])
  // State hiển thị trạng thái loading khi đang tải dữ liệu
  const [loading, setLoading] = useState(true)
  // State điều khiển việc mở/đóng modal thêm/sửa địa điểm
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false)
  // State lưu địa điểm đang được chỉnh sửa (null nếu đang thêm mới)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  // State lưu địa điểm đang được chọn để xem danh sách phòng
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  // State điều khiển việc mở/đóng modal thêm/sửa phòng
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false)
  // State lưu phòng đang được chỉnh sửa (null nếu đang thêm mới)
  const [editingArea, setEditingArea] = useState<Area | null>(null)
  // Hook để hiển thị thông báo toast (success/error)
  const { showToast } = useToast()
  // State điều khiển việc mở/đóng modal xác nhận xóa
  const [confirmOpen, setConfirmOpen] = useState(false)
  // State lưu nội dung thông báo trong modal xác nhận
  const [confirmMessage, setConfirmMessage] = useState('')
  // State lưu hàm callback sẽ được gọi khi người dùng xác nhận xóa
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  // ==========================================================================
  // HÀM LẤY DANH SÁCH ĐỊA ĐIỂM TỪ API
  // ==========================================================================
  /**
   * LUỒNG CHẠY:
   * 1. Bật trạng thái loading
   * 2. Kiểm tra token xác thực trong localStorage
   * 3. Gọi API lấy danh sách địa điểm
   * 4. Với mỗi địa điểm, gọi API lấy danh sách phòng (areas) tương ứng
   * 5. Cập nhật state venues với dữ liệu đã bao gồm areas
   * 6. Tắt trạng thái loading
   */
  const fetchVenues = async () => {
    try {
      setLoading(true)
      // Lấy token xác thực từ localStorage
      const token = localStorage.getItem('token')

      // Nếu không có token -> không thực hiện request
      if (!token) {
        console.error('No authentication token found')
        setVenues([])
        return
      }

      // Gọi API lấy tất cả địa điểm
      const venues = await venueService.getAll()

      // Với mỗi địa điểm, gọi API lấy danh sách phòng và gộp vào đối tượng venue
      // Sử dụng Promise.all để gọi song song nhiều request cùng lúc (tối ưu hiệu suất)
      const venuesWithAreas = await Promise.all(
        venues.map(async (venue) => {
          const areas = await areaService.getByVenueId(venue.venueId)
          return { ...venue, areas }
        })
      )

      // Cập nhật state với danh sách địa điểm đã có areas
      setVenues(venuesWithAreas)
    } catch (error) {
      console.error('Error fetching venues:', error)
      setVenues([])
    } finally {
      // Luôn tắt loading dù thành công hay thất bại
      setLoading(false)
    }
  }

  // ==========================================================================
  // HOOK useEffect - CHẠY KHI COMPONENT ĐƯỢC MOUNT
  // ==========================================================================
  /**
   * useEffect với dependency array rỗng [] -> chỉ chạy 1 lần khi component mount
   * Mục đích: Tải dữ liệu ban đầu cho trang
   */
  useEffect(() => {
    fetchVenues()
  }, [])

  // ==========================================================================
  // HOOK useEffect - REFRESH VENUES WHEN PAGE FOCUSES
  // ==========================================================================
  /**
   * useEffect để lắng nghe focus event của window
   * Mục đích: Fetch lại dữ liệu venues mỗi khi user quay lại tab này
   * Đảm bảo dữ liệu luôn fresh (real-time venue status)
   */
  useEffect(() => {
    const handleWindowFocus = () => {
      console.log('[Venues] Page focused - Refreshing venue data')
      fetchVenues()
    }

    // Thêm event listener cho window focus
    window.addEventListener('focus', handleWindowFocus)

    // Cleanup: Loại bỏ event listener khi component unmount
    return () => {
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  // ==========================================================================
  // CÁC HÀM XỬ LÝ CHO ĐỊA ĐIỂM (VENUE HANDLERS)
  // ==========================================================================

  /**
   * Mở modal thêm/sửa địa điểm
   * - Nếu truyền venue -> chế độ chỉnh sửa
   * - Nếu không truyền -> chế độ thêm mới
   */
  const handleOpenVenueModal = (venue?: Venue) => {
    setEditingVenue(venue || null)
    setIsVenueModalOpen(true)
  }

  /**
   * Xử lý khi người dùng click chọn một địa điểm
   * LUỒNG: Gọi API lấy danh sách phòng mới nhất -> cập nhật selectedVenue
   * Mục đích: Hiển thị section danh sách phòng của địa điểm đã chọn
   */
  const handleSelectVenue = async (venue: Venue) => {
    // Gọi API lấy danh sách phòng mới nhất (đảm bảo dữ liệu fresh)
    const freshAreas = await areaService.getByVenueId(venue.venueId)
    setSelectedVenue({ ...venue, areas: freshAreas })
  }

  /**
   * Xử lý submit form thêm/sửa địa điểm
   * LUỒNG:
   * 1. Kiểm tra token xác thực
   * 2. Nếu đang sửa -> gọi API update, ngược lại -> gọi API create
   * 3. Refresh lại danh sách địa điểm
   */
  const handleSubmitVenue = async (data: { venueId: number; venueName: string; address: string }) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        showToast('error', 'Bạn cần đăng nhập để thực hiện thao tác này')
        return
      }

      // Phân biệt giữa thêm mới và cập nhật dựa vào editingVenue
      if (editingVenue) {
        await venueService.update(data)
      } else {
        await venueService.create(data)
      }

      // Refresh danh sách sau khi thêm/sửa thành công
      await fetchVenues()
    } catch (error) {
      console.error('Error saving venue:', error)
      showToast('error', 'Có lỗi xảy ra khi lưu địa điểm')
      throw error
    }
  }

  /**
   * Thực hiện xóa địa điểm (được gọi sau khi người dùng xác nhận)
   * LUỒNG:
   * 1. Kiểm tra token
   * 2. Gọi API xóa địa điểm
   * 3. Refresh lại danh sách
   * 4. Đóng modal xác nhận
   */
  const performDeleteVenue = async (venueId: number) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        showToast('error', 'Bạn cần đăng nhập để thực hiện thao tác này')
        return
      }

      await venueService.delete(venueId)
      await fetchVenues()
      showToast('success', 'Xóa địa điểm thành công!')
    } catch (error: any) {
      console.error('Error deleting venue:', error)

      // Check if error response contains specific validation message
      const errorMessage = error?.response?.data?.message ||
        error?.message ||
        'Có lỗi xảy ra khi xóa địa điểm'

      showToast('error', errorMessage)
    } finally {
      // Đóng modal và reset action
      setConfirmOpen(false)
      setConfirmAction(null)
    }
  }

  /**
   * Mở modal xác nhận trước khi xóa địa điểm
   * LUỒNG: Set message + action -> mở modal confirm
   * Khi user bấm xác nhận -> confirmAction được gọi -> performDeleteVenue chạy
   * 
   * Hiển thị cảnh báo về hành động này sẽ ẩn địa điểm và tất cả các phòng liên quan
   */
  const handleDeleteVenue = (venueId: number) => {
    const warningMessage = 'Hành động này sẽ ẩn địa điểm và tất cả các phòng liên quan. Bạn có chắc chắn muốn tiếp tục?'
    setConfirmMessage(warningMessage)
    // Lưu hàm xóa vào state, sẽ được gọi khi user confirm
    setConfirmAction(() => () => performDeleteVenue(venueId))
    setConfirmOpen(true)
  }

  // ==========================================================================
  // CÁC HÀM XỬ LÝ CHO PHÒNG (AREA HANDLERS)
  // ==========================================================================

  /**
   * Mở modal thêm/sửa phòng
   * - Nếu truyền area -> chế độ chỉnh sửa
   * - Nếu không truyền -> chế độ thêm mới
   */
  const handleOpenAreaModal = (area?: Area) => {
    setEditingArea(area || null)
    setIsAreaModalOpen(true)
  }

  /**
   * Xử lý submit form thêm/sửa phòng
   * LUỒNG:
   * 1. Kiểm tra token xác thực
   * 2. Nếu đang sửa -> gọi API update, ngược lại -> gọi API create
   * 3. Refresh lại danh sách tất cả địa điểm
   * 4. Nếu đang có địa điểm được chọn -> refresh lại danh sách phòng của địa điểm đó
   */
  const handleSubmitArea = async (data: {
    areaId: number
    venueId: number
    areaName: string
    floor: number
    capacity: number
    status: string
  }) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        showToast('error', 'Bạn cần đăng nhập để thực hiện thao tác này')
        return
      }

      // Phân biệt giữa thêm mới và cập nhật dựa vào editingArea
      if (editingArea) {
        await areaService.update(data)
        showToast('success', 'Cập nhật phòng thành công!')
      } else {
        await areaService.create(data)
        showToast('success', 'Thêm phòng thành công!')
      }

      // Refresh danh sách tất cả địa điểm
      fetchVenues()

      // Nếu đang có địa điểm được chọn -> cập nhật lại danh sách phòng
      if (selectedVenue) {
        const freshAreas = await areaService.getByVenueId(selectedVenue.venueId)
        setSelectedVenue({ ...selectedVenue, areas: freshAreas })
      }
    } catch (error) {
      console.error('Error saving area:', error)
      showToast('error', `Có lỗi xảy ra khi ${editingArea ? 'cập nhật' : 'thêm'} phòng`)
      throw error
    }
  }

  /**
   * Thực hiện xóa phòng (được gọi sau khi người dùng xác nhận)
   * LUỒNG:
   * 1. Kiểm tra token
   * 2. Gọi API xóa phòng
   * 3. Refresh lại danh sách địa điểm
   * 4. Nếu đang có địa điểm được chọn -> refresh lại danh sách phòng
   * 5. Đóng modal xác nhận
   */
  const performDeleteArea = async (areaId: number) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        showToast('error', 'Bạn cần đăng nhập để thực hiện thao tác này')
        return
      }

      await areaService.delete(areaId)
      showToast('success', 'Xóa phòng thành công!')

      // Refresh danh sách tất cả địa điểm
      fetchVenues()

      // Nếu đang có địa điểm được chọn -> cập nhật lại danh sách phòng
      if (selectedVenue) {
        const freshAreas = await areaService.getByVenueId(selectedVenue.venueId)
        setSelectedVenue({ ...selectedVenue, areas: freshAreas })
      }
    } catch (error: any) {
      console.error('Error deleting area:', error)

      // Check if error response contains specific validation message
      const errorMessage = error?.response?.data?.message ||
        error?.message ||
        'Có lỗi xảy ra khi xóa phòng'

      showToast('error', errorMessage)
    } finally {
      // Đóng modal và reset action
      setConfirmOpen(false)
      setConfirmAction(null)
    }
  }

  /**
   * Mở modal xác nhận trước khi xóa phòng
   * Tương tự handleDeleteVenue nhưng cho phòm (area)
   */
  const handleDeleteArea = (areaId: number) => {
    setConfirmMessage('Bạn có chắc chắn muốn xóa phòng này? Hành động này sẽ ẩn phòng khỏi danh sách.')
    setConfirmAction(() => () => performDeleteArea(areaId))
    setConfirmOpen(true)
  }

  // ==========================================================================
  // LỌC DANH SÁCH ĐỊA ĐIỂM THEO TỪ KHÓA TÌM KIẾM
  // ==========================================================================
  /**
   * Lọc danh sách venues theo tên địa điểm
   * Sử dụng toLowerCase() để tìm kiếm không phân biệt hoa thường
   */
  const filtered = venues.filter(v =>
    v?.venueName?.toLowerCase().includes(search.toLowerCase()),
  )

  // ==========================================================================
  // PHẦN RENDER GIAO DIỆN
  // ==========================================================================
  /**
   * CẤU TRÚC GIAO DIỆN:
   * 1. Header: Tiêu đề + nút "Thêm địa điểm"
   * 2. Ô tìm kiếm địa điểm
   * 3. Nội dung chính:
   *    - Nếu loading -> hiển thị spinner
   *    - Nếu không có dữ liệu -> hiển thị empty state
   *    - Có dữ liệu -> hiển thị VenueList
   * 4. AreaListSection: Hiển thị khi có địa điểm được chọn
   * 5. Các Modal: VenueFormModal, AreaFormModal, ConfirmModal
   */
  return (
    <div>
      {/* ========== HEADER: TIÊU ĐỀ VÀ NÚT THÊM ĐỊA ĐIỂM ========== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý địa điểm</h1>
          <p className="text-sm text-gray-600 mt-1">Quản lý các địa điểm tổ chức sự kiện</p>
        </div>
        {/* Nút thêm địa điểm mới - mở modal với editingVenue = null */}
        <button
          onClick={() => handleOpenVenueModal()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <PlusCircle className="w-5 h-5" />
          Thêm địa điểm
        </button>
      </div>

      {/* ========== Ô TÌM KIẾM ĐỊA ĐIỂM ========== */}
      {/* Khi người dùng nhập -> cập nhật state search -> filtered tự động cập nhật */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Tìm kiếm địa điểm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* ========== NỘI DUNG CHÍNH: DANH SÁCH ĐỊA ĐIỂM ========== */}
      {/* Conditional rendering dựa trên trạng thái loading và dữ liệu */}
      {loading ? (
        // Trường hợp 1: Đang tải dữ liệu -> hiển thị loading spinner
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải...</p>
        </div>
      ) : filtered.length === 0 ? (
        // Trường hợp 2: Không có dữ liệu -> hiển thị empty state
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Chưa có địa điểm nào</p>
          <p className="text-sm text-gray-400 mt-1">Hãy thêm địa điểm đầu tiên để bắt đầu</p>
        </div>
      ) : (
        // Trường hợp 3: Có dữ liệu -> hiển thị danh sách địa điểm
        // Props: danh sách địa điểm đã lọc, ID địa điểm đang chọn, các callback handlers
        <VenueList
          venues={filtered}
          selectedVenueId={selectedVenue?.venueId || null}
          onSelect={handleSelectVenue}
          onEdit={handleOpenVenueModal}
          onDelete={handleDeleteVenue}
        />
      )}

      {/* ========== SECTION DANH SÁCH PHÒNG ========== */}
      {/* Chỉ hiển thị khi có địa điểm được chọn (selectedVenue !== null) */}
      {selectedVenue && (
        <AreaListSection
          venueName={selectedVenue.venueName}
          venueAddress={selectedVenue.address}
          areas={selectedVenue.areas || []}
          onClose={() => setSelectedVenue(null)}  // Đóng section khi click nút close
          onAdd={() => handleOpenAreaModal()}     // Mở modal thêm phòng mới
          onEdit={handleOpenAreaModal}            // Mở modal sửa phòng
          onDelete={handleDeleteArea}             // Xử lý xóa phòng
        />
      )}

      {/* ========== MODAL THÊM/SỬA ĐỊA ĐIỂM ========== */}
      {/* isOpen: điều khiển hiển thị modal */}
      {/* venue: địa điểm đang sửa (null nếu thêm mới) */}
      <VenueFormModal
        isOpen={isVenueModalOpen}
        venue={editingVenue}
        onClose={() => setIsVenueModalOpen(false)}
        onSubmit={handleSubmitVenue}
      />

      {/* ========== MODAL THÊM/SỬA PHÒNG ========== */}
      {/* venueId: ID của địa điểm đang chọn (phòng sẽ thuộc địa điểm này) */}
      <AreaFormModal
        isOpen={isAreaModalOpen}
        area={editingArea}
        venueId={selectedVenue?.venueId || 0}
        onClose={() => setIsAreaModalOpen(false)}
        onSubmit={handleSubmitArea}
      />

      {/* ========== MODAL XÁC NHẬN XÓA ========== */}
      {/* Dùng chung cho cả xóa địa điểm và xóa phòng */}
      {/* confirmAction chứa hàm xóa tương ứng (performDeleteVenue hoặc performDeleteArea) */}
      <ConfirmModal
        isOpen={confirmOpen}
        message={confirmMessage}
        onConfirm={() => confirmAction && confirmAction()}
        onClose={() => { setConfirmOpen(false); setConfirmAction(null) }}
      />
    </div>
  )
}


