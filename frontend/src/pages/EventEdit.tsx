// Import router hooks + Link
import { useParams, useNavigate, Link } from 'react-router-dom'
// useParams: lấy param trên URL (vd /dashboard/events/:id/edit -> lấy id)
// useNavigate: điều hướng trang bằng code
// Link: chuyển trang SPA không reload

// Import icon để UI đẹp hơn
import { Upload, X, Plus, Trash2, Search, Loader, User } from 'lucide-react'
// Upload: icon upload ảnh
// X: icon đóng / xóa ảnh
// Plus: icon thêm vé
// Trash2: icon xóa loại vé

// React hooks
import { useState, useEffect, useRef } from 'react'
// useState: lưu state form (speaker, tickets, banner, loading...)
// useEffect: gọi API load dữ liệu (expectedCapacity, event detail) khi mount
// useRef: lưu biến không gây re-render (ở đây dùng để chặn spam toast warning)

// Utils upload ảnh
import { uploadEventBanner, validateImageFile } from '../utils/imageUpload'
// validateImageFile: validate file ảnh (đuôi file/size/...)
// uploadEventBanner: upload ảnh lên server/storage và trả về URL

// Toast context để hiện thông báo dạng toast
import { useToast } from '../contexts/ToastContext'
// showToast(type, message): hiển thị toast success/error/warning

// ======================= TYPES =======================

// TicketType: chỉ cho phép 2 loại vé (VIP hoặc STANDARD)
type TicketType = 'VIP' | 'STANDARD'

// Ticket: cấu trúc dữ liệu 1 loại vé trong form edit
type Ticket = {
  name: TicketType          // VIP / STANDARD
  description: string       // mô tả loại vé
  price: number             // giá vé
  maxQuantity: number       // số lượng tối đa (giới hạn bán)
  status: 'ACTIVE'          // trạng thái vé (ở đây hardcode ACTIVE)
}

export default function EventEdit() {
  // ======================= ROUTER + CONTEXT =======================

  // Lấy id event từ URL param
  const { id } = useParams<{ id: string }>()

  // navigate: chuyển trang bằng code
  const navigate = useNavigate()

  // showToast: hiển thị toast message
  const { showToast } = useToast()

  // ======================= STATE CHUNG =======================

  // loading: đang load dữ liệu (fetch detail event)
  const [loading, setLoading] = useState(false)

  // isSubmitting: trạng thái đang submit form update (disable nút)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // error: lỗi tổng (validate hoặc API fail)
  const [error, setError] = useState<string | null>(null)

  // expectedCapacity: số lượng dự kiến từ “event request” (để giới hạn tổng số vé)
  const [expectedCapacity, setExpectedCapacity] = useState<number>(0)

  // isEventOpen: event đang OPEN không (OPEN thì không cho chỉnh maxQuantity / add/remove loại vé)
  const [isEventOpen, setIsEventOpen] = useState<boolean>(false)

  // hasBookings: event đã có vé được đặt chưa (nếu có thì khóa chỉnh sửa ticket)
  const [hasBookings, setHasBookings] = useState<boolean>(false)

  // ======================= EVENT INFO STATE =======================

  // eventInfo: thông tin cơ bản của event (cần gửi lên backend)
  const [eventInfo, setEventInfo] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    maxSeats: 0,
    areaId: 0,
  })

  // ======================= CHOSEN SPEAKERS STATE =======================
  interface Speaker {
    speakerId?: number
    speaker_id?: number
    fullName?: string
    full_name?: string
    bio?: string
    email?: string
    phone?: string
    avatarUrl?: string
    avatar_url?: string
  }

  const [selectedSpeakers, setSelectedSpeakers] = useState<Speaker[]>([])
  const [allSpeakers, setAllSpeakers] = useState<Speaker[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Drawer state
  const [drawerFormData, setDrawerFormData] = useState({
    fullName: '',
    bio: '',
    email: '',
    phone: '',
    avatarUrl: ''
  })
  const [drawerAvatarPreview, setDrawerAvatarPreview] = useState<string | null>(null)
  const [drawerAvatarFile, setDrawerAvatarFile] = useState<File | null>(null)
  const [drawerSubmitting, setDrawerSubmitting] = useState(false)

  useEffect(() => {
    const fetchAllSpeakers = async () => {
      try {
        const response = await fetch('/api/v1/admin/speakers')
        if (response.ok) {
          const data = await response.json()
          const normalized = data.map((sp: any) => ({
            ...sp,
            speaker_id: sp.speakerId || sp.speaker_id,
            speakerId: sp.speakerId || sp.speaker_id,
            fullName: sp.fullName || sp.full_name || '',
            full_name: sp.fullName || sp.full_name || '',
            avatarUrl: sp.avatarUrl || sp.avatar_url || '',
            avatar_url: sp.avatarUrl || sp.avatar_url || '',
          }))
          setAllSpeakers(normalized)
        }
      } catch (err) {
        console.error('Error fetching all speakers:', err)
      }
    }
    fetchAllSpeakers()
  }, [])

  const isDuplicateSpeaker = (s1: Speaker, s2: Speaker) => {
    const id1 = s1.speakerId || s1.speaker_id
    const id2 = s2.speakerId || s2.speaker_id
    if (id1 && id2 && id1 === id2) return true

    const email1 = (s1.email || '').trim().toLowerCase()
    const email2 = (s2.email || '').trim().toLowerCase()
    if (email1 && email2 && email1 === email2) return true

    const name1 = (s1.fullName || s1.full_name || '').trim().toLowerCase()
    const name2 = (s2.fullName || s2.full_name || '').trim().toLowerCase()
    if (name1 && name2 && name1 === name2) return true

    return false
  }

  const filteredSuggestions = allSpeakers.filter((sp) => {
    const isAlreadySelected = selectedSpeakers.some((selected) => isDuplicateSpeaker(selected, sp))
    if (isAlreadySelected) return false

    return (
      (sp.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sp.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  // ======================= TICKET STATE =======================

  /**
   * tickets: danh sách loại vé
   * Default tạo sẵn 2 loại VIP + STANDARD để user nhập nhanh
   */
  const [tickets, setTickets] = useState<Ticket[]>([
    { name: 'VIP', description: '', price: 0, maxQuantity: 0, status: 'ACTIVE' },
    { name: 'STANDARD', description: '', price: 0, maxQuantity: 0, status: 'ACTIVE' },
  ])

  // ======================= BANNER IMAGE STATE =======================

  // bannerUrl: URL banner hiện tại (từ API hoặc sau khi upload)
  const [bannerUrl, setBannerUrl] = useState('')

  // selectedImage: file banner user vừa chọn (để upload)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)

  // imagePreview: preview base64 hoặc url để hiển thị ảnh trước khi submit
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // isDragging: UI trạng thái drag-drop banner
  const [isDragging, setIsDragging] = useState(false)



  // ======================= REF CHẶN SPAM TOAST =======================

  /**
   * hasShownWarningRef:
   * - dùng để chặn việc toast warning bị spam liên tục khi user nhập maxQuantity
   * - ref không làm component re-render
   */
  const hasShownWarningRef = useRef(false)

  // ======================= 1) FETCH EVENT REQUEST -> LẤY expectedCapacity =======================

  /**
   * useEffect này chạy khi có id
   * Mục tiêu:
   * - gọi API event request của organizer: /api/event-requests/my
   * - tìm request nào tạo ra eventId này (createdEventId == id)
   * - lấy expectedCapacity từ request để dùng validate số lượng vé
   */
  useEffect(() => {
    const fetchEventRequest = async () => {
      try {
        // gọi API lấy danh sách event requests của user hiện tại
        const response = await fetch('/api/event-requests/my', {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        })

        if (response.ok) {
          const data = await response.json()

          // Vì BE có thể trả:
          // - array thẳng
          // - hoặc object {pending:[], approved:[], rejected:[]}
          let allRequests: any[] = []
          if (Array.isArray(data)) {
            allRequests = data
          } else {
            allRequests = [
              ...(Array.isArray(data.pending) ? data.pending : []),
              ...(Array.isArray(data.approved) ? data.approved : []),
              ...(Array.isArray(data.rejected) ? data.rejected : []),
            ]
          }

          // tìm request tương ứng event này (createdEventId == id)
          const matchingRequest = allRequests.find(
            (req: any) => req.createdEventId === parseInt(id!),
          )

          // nếu tìm thấy và có expectedCapacity -> set state
          if (matchingRequest && matchingRequest.expectedCapacity) {
            setExpectedCapacity(matchingRequest.expectedCapacity)
            console.log('Expected capacity from request:', matchingRequest.expectedCapacity)
          }
        }
      } catch (error) {
        console.error('Error fetching event request:', error)
      }
    }

    // chỉ gọi nếu có id
    if (id) {
      fetchEventRequest()
    }
  }, [id])

  // ======================= 2) FETCH EVENT DETAILS -> PREFILL FORM =======================

  /**
   * useEffect này chạy khi có id:
   * - setLoading(true)
   * - gọi fetchEventDetails() để lấy banner/speaker/tickets nếu event OPEN
   *
   * Lưu ý: bạn có comment “Removed fetching event details...” nhưng thật ra vẫn đang gọi fetchEventDetails.
   */
  useEffect(() => {
    if (id) {
      setLoading(true)
      fetchEventDetails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * fetchEventDetails:
   * - gọi /api/events/detail?id=...
   * - xác định status event (OPEN hay không)
   * - Nếu OPEN:
   *   + prefill banner, speaker, tickets
   *   + lock maxQuantity (readOnly)
   * - Nếu NOT OPEN:
   *   + reset form về mặc định để organizer nhập lại
   */
  const fetchEventDetails = async () => {
    try {
      const response = await fetch(`/api/events/detail?id=${id}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Event details:', data)

        // ===== Check hasBookings từ backend để khóa ticket editing =====
        if (data.hasBookings !== undefined && data.hasBookings !== null) {
          setHasBookings(!!data.hasBookings)
        }

        // ===== SỬA LỖI: Check event đang THỰC SỰ diễn ra (start_time <= NOW < end_time) =====
        // Không chỉ check status === 'OPEN', vì event sắp diễn ra cũng có status OPEN
        const now = new Date()
        const startTime = data.startTime ? new Date(data.startTime) : null
        const endTime = data.endTime ? new Date(data.endTime) : null

        // Event đang diễn ra = status OPEN + (NOW >= start_time AND NOW < end_time)
        const statusStr = data.status ? String(data.status).toUpperCase() : ''
        const isOpen = !!(statusStr === 'OPEN' &&
          startTime &&
          endTime &&
          now >= startTime &&
          now < endTime)
        setIsEventOpen(isOpen)

        // ===== POPULATE EVENT INFO (luôn lưu để gửi lên backend) =====
        setEventInfo({
          title: data.title || '',
          description: data.description || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          maxSeats: data.maxSeats || 0,
          areaId: data.areaId || 0,
        })

        // ===== PREFILL BANNER (luôn luôn hiển thị nếu có) =====
        if (data.bannerUrl) {
          setBannerUrl(data.bannerUrl)
          setImagePreview(data.bannerUrl)
        }

        /**
         * Prefill speaker:
         * - tolerant nhiều kiểu data: data.speakers[0], data.speaker, hoặc nhiều field khác
         * - mục tiêu: tránh BE đổi format làm FE crash
         */
        const speakerFromApi = (() => {
          if (Array.isArray(data.speakers) && data.speakers.length > 0) return data.speakers[0]
          if (data.speaker) return data.speaker
          return {
            fullName:
              data.speakerFullName || data.speakerName || data.speaker_full_name || data.speakerFullname || data.speaker || '',
            bio:
              data.speakerBio || data.speaker_bio || data.speakerDescription || data.speaker_description || '',
            email:
              data.speakerEmail || data.speaker_email || data.contactEmail || data.contact_email || data.email || '',
            phone:
              data.speakerPhone || data.speaker_phone || data.phone || data.phoneNumber || data.mobile || data.contactPhone || data.contact_phone || '',
            avatarUrl:
              data.speakerAvatarUrl || data.speaker_avatar_url || data.avatarUrl || data.speakerAvatar || data.speaker_avatar || '',
          }
        })()

        // ===== PREFILL SPEAKER (luôn luôn hiển thị nếu có) =====
        if (speakerFromApi && (speakerFromApi.fullName || speakerFromApi.bio || speakerFromApi.email)) {
          const loadedSpeaker = {
            speakerId: data.speakerId || speakerFromApi.speakerId || speakerFromApi.speaker_id || undefined,
            speaker_id: data.speakerId || speakerFromApi.speakerId || speakerFromApi.speaker_id || undefined,
            fullName: speakerFromApi.fullName || speakerFromApi.full_name || '',
            full_name: speakerFromApi.fullName || speakerFromApi.full_name || '',
            bio: speakerFromApi.bio || '',
            email: speakerFromApi.email || '',
            phone: speakerFromApi.phone || '',
            avatarUrl: speakerFromApi.avatarUrl || speakerFromApi.avatar_url || '',
            avatar_url: speakerFromApi.avatarUrl || speakerFromApi.avatar_url || '',
          }
          setSelectedSpeakers([loadedSpeaker])
        }

        // ===== PREFILL TICKETS (luôn luôn hiển thị nếu có) =====
        if (Array.isArray(data.tickets) && data.tickets.length > 0) {
          const mapped = data.tickets.map((tk: any) => ({
            name: tk.name || 'STANDARD',
            description: tk.description || '',
            price: Number(tk.price) || 0,
            maxQuantity: Number(tk.maxQuantity) || 0,
            status: tk.status || 'ACTIVE',
          }))
          setTickets(mapped)
        }
      } else {
        throw new Error('Failed to fetch event details')
      }
    } catch (error) {
      console.error('Error fetching event:', error)
      setError(error instanceof Error ? error.message : 'Đã xảy ra lỗi')
    } finally {
      setLoading(false)
    }
  }

  // ======================= HANDLERS: SPEAKER =======================

  const handleSelectSpeaker = (sp: any) => {
    const clickedSpeaker = {
      ...sp,
      speaker_id: sp.speakerId || sp.speaker_id,
      speakerId: sp.speakerId || sp.speaker_id,
      fullName: sp.fullName || sp.full_name || '',
      full_name: sp.fullName || sp.full_name || '',
      avatarUrl: sp.avatarUrl || sp.avatar_url || '',
      avatar_url: sp.avatarUrl || sp.avatar_url || '',
    }
    if (!selectedSpeakers.some(s => isDuplicateSpeaker(s, clickedSpeaker))) {
      setSelectedSpeakers([...selectedSpeakers, clickedSpeaker]);
    }
    setSearchQuery('')
  }

  const handleRemoveSelectedSpeaker = (speakerId?: number) => {
    setSelectedSpeakers(selectedSpeakers.filter(s => (s.speakerId !== speakerId && s.speaker_id !== speakerId)))
  }

  const handleOpenDrawer = (query: string) => {
    setDrawerFormData({
      fullName: query,
      bio: '',
      email: '',
      phone: '',
      avatarUrl: ''
    })
    setDrawerAvatarPreview(null)
    setDrawerAvatarFile(null)
    setIsDrawerOpen(true)
  }

  const handleDrawerSave = async () => {
    if (!drawerFormData.fullName.trim()) {
      showToast('error', 'Họ và tên là bắt buộc')
      return
    }
    if (!drawerFormData.bio.trim()) {
      showToast('error', 'Tiểu sử là bắt buộc')
      return
    }
    if (!drawerFormData.email.trim()) {
      showToast('error', 'Email là bắt buộc')
      return
    }
    if (!drawerFormData.phone.trim()) {
      showToast('error', 'Số điện thoại là bắt buộc')
      return
    }

    setDrawerSubmitting(true)
    try {
      let avatarUrl = ''
      if (drawerAvatarFile) {
        avatarUrl = await uploadEventBanner(drawerAvatarFile)
      }

      const payload = {
        fullName: drawerFormData.fullName,
        bio: drawerFormData.bio,
        email: drawerFormData.email,
        phone: drawerFormData.phone,
        avatarUrl: avatarUrl
      }

      const res = await fetch('/api/v1/speakers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const createdSpeaker = await res.json()
        const normalizedCreated = {
          ...createdSpeaker,
          speaker_id: createdSpeaker.speakerId || createdSpeaker.speaker_id,
          speakerId: createdSpeaker.speakerId || createdSpeaker.speaker_id,
          fullName: createdSpeaker.fullName || createdSpeaker.full_name || '',
          full_name: createdSpeaker.fullName || createdSpeaker.full_name || '',
          avatarUrl: createdSpeaker.avatarUrl || createdSpeaker.avatar_url || '',
          avatar_url: createdSpeaker.avatarUrl || createdSpeaker.avatar_url || '',
        }
        showToast('success', 'Thêm diễn giả thành công')
        if (!selectedSpeakers.some(s => isDuplicateSpeaker(s, normalizedCreated))) {
          setSelectedSpeakers([...selectedSpeakers, normalizedCreated]);
        }
        setAllSpeakers(prev => [normalizedCreated, ...prev])
        setIsDrawerOpen(false)
      } else {
        const text = await res.text()
        showToast('error', text || 'Lỗi khi tạo diễn giả')
      }
    } catch (err) {
      console.error('Error creating speaker inline:', err)
      showToast('error', 'Không thể kết nối máy chủ')
    } finally {
      setDrawerSubmitting(false)
    }
  }

  // ======================= HANDLERS: TICKET =======================

  /**
   * handleTicketChange:
   * - cập nhật field của 1 ticket theo index
   * - convert price/maxQuantity về number để tránh lỗi string concat
   * - validate tổng maxQuantity không vượt expectedCapacity
   */
  const handleTicketChange = (
    index: number,
    field: keyof Ticket,
    value: string | number,
  ) => {
    setTickets((prev) => {
      const updated = [...prev]

      // Nếu field là price/maxQuantity -> convert sang number
      const convertedValue =
        field === 'price' || field === 'maxQuantity'
          ? value === ''
            ? 0
            : Number(value)
          : value

      // cập nhật ticket tại index
      updated[index] = { ...updated[index], [field]: convertedValue }

      /**
       * Validate capacity:
       * - chỉ validate khi user đang đổi maxQuantity và expectedCapacity > 0
       * - tính tổng maxQuantity tất cả vé
       * - nếu vượt expectedCapacity -> show toast cảnh báo và revert change
       */
      if (field === 'maxQuantity' && expectedCapacity > 0) {
        let numValue = typeof value === 'string' ? parseInt(value, 10) : value

        // nếu user nhập rỗng hoặc NaN -> coi như 0
        if (isNaN(numValue) || numValue < 0) {
          numValue = 0
        }

        // tổng maxQuantity của tất cả vé
        const totalMaxQuantity = updated.reduce((sum, ticket) => {
          return sum + (Number(ticket.maxQuantity) || 0)
        }, 0)

        // nếu tổng vượt expectedCapacity -> cảnh báo và revert
        if (totalMaxQuantity > expectedCapacity) {
          if (!hasShownWarningRef.current) {
            showToast(
              'warning',
              `Tổng số lượng tối đa của tất cả vé (${totalMaxQuantity}) không được vượt quá ${expectedCapacity} (số lượng dự kiến từ yêu cầu)`,
            )
            hasShownWarningRef.current = true

            // reset flag sau 2s để cho phép cảnh báo lại nếu user nhập tiếp
            setTimeout(() => {
              hasShownWarningRef.current = false
            }, 2000)
          }

          // revert thay đổi: trả ticket về giá trị cũ
          updated[index] = prev[index]
          return updated
        }
      }

      return updated
    })
  }

  // giới hạn số loại vé tối đa (ở đây chỉ cho 2 loại)
  const MAX_TICKETS = 2

  /**
   * handleAddTicket:
   * - thêm 1 loại vé mới
   * - nếu event đang OPEN -> không cho thêm
   * - nếu đã đủ MAX_TICKETS -> không cho thêm
   * - ===== SỬA LỖI: Không cho phép tạo trùng loại vé =====
   */
  const handleAddTicket = () => {
    if (isEventOpen) {
      showToast('warning', 'Không thể thêm loại vé khi sự kiện đang diễn ra')
      return
    }
    if (tickets.length >= MAX_TICKETS) {
      showToast('warning', `Tối đa chỉ được thêm ${MAX_TICKETS} loại vé`)
      return
    }

    // ===== SỬA LỖI: Tự động chọn loại vé chưa có =====
    // Nếu đã có VIP thì thêm STANDARD, nếu đã có STANDARD thì thêm VIP
    const existingTypes = tickets.map(t => t.name)
    let newTicketName: TicketType

    if (existingTypes.includes('VIP') && !existingTypes.includes('STANDARD')) {
      newTicketName = 'STANDARD'
    } else if (existingTypes.includes('STANDARD') && !existingTypes.includes('VIP')) {
      newTicketName = 'VIP'
    } else {
      // Default: nếu chưa có gì hoặc có cả 2 rồi (shouldn't happen do MAX_TICKETS=2)
      newTicketName = existingTypes.includes('VIP') ? 'STANDARD' : 'VIP'
    }

    // thêm ticket vào state
    setTickets((prev) => [
      ...prev,
      { name: newTicketName, description: '', price: 0, maxQuantity: 0, status: 'ACTIVE' },
    ])
  }

  /**
   * handleRemoveTicket:
   * - xóa loại vé theo index
   * - nếu event OPEN -> không cho xóa
   * - phải còn ít nhất 1 ticket
   */
  const handleRemoveTicket = (index: number) => {
    if (isEventOpen) {
      showToast('warning', 'Không thể xóa loại vé khi sự kiện đang diễn ra')
      return
    }
    if (tickets.length <= 1) {
      setError('Phải có ít nhất 1 loại vé')
      return
    }
    setTickets((prev) => prev.filter((_, i) => i !== index))
  }

  /**
   * handleTicketTypeChange:
   * - đổi name VIP/STANDARD cho ticket
   * - ===== SỬA LỖI: Validate không cho trùng loại vé =====
   */
  const handleTicketTypeChange = (index: number, newType: TicketType) => {
    setTickets((prev) => {
      // Check xem loại vé mới đã tồn tại ở ticket khác chưa
      const isDuplicate = prev.some((ticket, i) => i !== index && ticket.name === newType)

      if (isDuplicate) {
        showToast('warning', `Loại vé ${newType} đã tồn tại. Vui lòng chọn loại vé khác.`)
        return prev // không update, giữ nguyên
      }

      const updated = [...prev]
      updated[index] = { ...updated[index], name: newType }
      return updated
    })
  }

  // ======================= HANDLERS: BANNER IMAGE (SELECT + DRAG DROP) =======================

  /**
   * handleImageSelect:
   * - user chọn file từ input
   * - validate file (định dạng/size)
   * - lưu selectedImage và tạo preview bằng FileReader
   */
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      return
    }

    setSelectedImage(file)
    setError(null)

    // FileReader dùng để preview ảnh ngay trên UI (base64)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // handleRemoveImage: xóa banner đã chọn
  const handleRemoveImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setBannerUrl('')
    setError(null)
  }

  // handleDragOver: khi kéo file vào vùng drop -> set isDragging để đổi UI
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  // handleDragLeave: khi kéo ra khỏi vùng -> tắt isDragging
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  /**
   * handleDrop:
   * - user thả file vào vùng drop
   * - validate file
   * - setSelectedImage + tạo preview
   */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      return
    }

    setSelectedImage(file)
    setError(null)

    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }



  // ======================= SUBMIT FORM (UPDATE EVENT) =======================

  /**
   * handleSubmit:
   * - chạy khi bấm “Cập nhật sự kiện”
   * Flow:
   * 1) validate maxQuantity bội số 10
   * 2) validate tổng maxQuantity <= expectedCapacity
   * 3) upload banner nếu có file
   * 4) upload avatar nếu có file
   * 5) build requestBody
   * 6) call POST /api/events/update-details
   * 7) success -> toast + về danh sách events
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // ===== REMOVED: maxQuantity chia hết 10 validation (không hợp lý) =====

      // ===== VALIDATE: tổng số vé không vượt expectedCapacity =====
      if (expectedCapacity > 0) {
        const totalMaxQuantity = tickets.reduce((sum, ticket) => sum + ticket.maxQuantity, 0)
        if (totalMaxQuantity > expectedCapacity) {
          setError(
            `Tổng số lượng tối đa của tất cả vé (${totalMaxQuantity}) không được vượt quá số lượng dự kiến (${expectedCapacity})`,
          )
          setIsSubmitting(false)
          return
        }
      }

      if (selectedSpeakers.length === 0) {
        setError('Vui lòng chọn hoặc thêm diễn giả')
        setIsSubmitting(false)
        return
      }

      // ===== UPLOAD BANNER nếu user chọn ảnh mới =====
      let finalBannerUrl = bannerUrl
      if (selectedImage) {
        try {
          console.log('Uploading banner image...')
          finalBannerUrl = await uploadEventBanner(selectedImage)
          console.log('Banner uploaded successfully:', finalBannerUrl)
        } catch (uploadError: any) {
          console.error('Banner upload failed:', uploadError)
          showToast('warning', 'Không thể tải ảnh banner lên. Sự kiện sẽ giữ nguyên ảnh cũ.')
          finalBannerUrl = bannerUrl
        }
      }

      const activeSpeaker = selectedSpeakers[0]

      /**
       * requestBody:
       * - eventId
       * - title, description, startTime, endTime, maxSeats, areaId (required by backend)
       * - speaker info
       * - tickets array (convert number)
       * - bannerUrl sau upload
       */
      const requestBody = {
        eventId: parseInt(id!),
        title: eventInfo.title,
        description: eventInfo.description,
        startTime: eventInfo.startTime,
        endTime: eventInfo.endTime,
        maxSeats: eventInfo.maxSeats,
        areaId: eventInfo.areaId,
        speaker: activeSpeaker ? {
          speakerId: activeSpeaker.speakerId || activeSpeaker.speaker_id,
          fullName: activeSpeaker.fullName || activeSpeaker.full_name || '',
          bio: activeSpeaker.bio || '',
          email: activeSpeaker.email || '',
          phone: activeSpeaker.phone || '',
          avatarUrl: activeSpeaker.avatarUrl || activeSpeaker.avatar_url || '',
        } : null,
        speakers: selectedSpeakers.map(s => ({
          speakerId: s.speakerId || s.speaker_id,
          fullName: s.fullName || s.full_name || '',
          bio: s.bio || '',
          email: s.email || '',
          phone: s.phone || '',
          avatarUrl: s.avatarUrl || s.avatar_url || '',
        })),
        speaker_ids: selectedSpeakers.map(s => s.speaker_id || s.speakerId).filter(Boolean),
        speakerIds: selectedSpeakers.map(s => s.speakerId || s.speaker_id).filter(Boolean),
        tickets: tickets.map((ticket) => ({
          name: ticket.name,
          description: ticket.description,
          price: Number(ticket.price),
          maxQuantity: Number(ticket.maxQuantity),
          status: 'ACTIVE',
        })),
        bannerUrl: finalBannerUrl,
      }

      console.log('Updating event with:', requestBody)

      // ===== CALL API UPDATE =====
      const response = await fetch(`/api/events/update-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      console.log('API Response Status:', response.status)
      const responseText = await response.text()
      console.log('API Response Body:', responseText)

      // ===== HANDLE RESPONSE =====
      if (response.ok) {
        showToast('success', 'Cập nhật sự kiện thành công!')
        // Wait a bit for backend to fully commit changes
        await new Promise(resolve => setTimeout(resolve, 500))
        navigate('/dashboard/events')
      } else {
        const errorMessage = responseText || 'Failed to update event'
        showToast('error', errorMessage)
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error('Error updating event:', error)
      setError(error instanceof Error ? error.message : 'Không thể cập nhật sự kiện')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ======================= UI LOADING =======================
  // Nếu đang loading (đang fetch detail) -> hiển thị loading screen
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    )
  }

  // ======================= RENDER FORM UI =======================
  return (
    <div className="flex justify-center">
      <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg shadow-md p-8 max-w-6xl w-full">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Cập nhật thông tin sự kiện
        </h1>

        {/* Banner thông tin: event đang diễn ra thì lock maxQuantity */}
        {isEventOpen && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
            ⚠️ Sự kiện đang diễn ra — không thể thay đổi số lượng vé và thêm/xóa loại vé. Các trường khác vẫn có thể chỉnh sửa.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Cột trái: Banner & Diễn giả */}
            <div className="lg:col-span-5 space-y-6">
              {/* ================= BANNER UPLOAD ================= */}
              <div className="bg-slate-50/50 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-3 shadow-sm">
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-350 uppercase tracking-wider">
                  Banner sự kiện *
                </label>

                {!imagePreview ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                      }`}
                  >
                    <input
                      type="file"
                      id="banner-upload"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <label htmlFor="banner-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-xs text-gray-600 dark:text-slate-350 mb-1">Kéo thả ảnh hoặc click để chọn</p>
                      <p className="text-[10px] text-gray-505 dark:text-slate-500">PNG, JPG, GIF tối đa 5MB</p>
                    </label>
                  </div>
                ) : (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md">
                    <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-650 text-white rounded-full transition-colors shadow-lg active:scale-90"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* ================= SPEAKER INFO ================= */}
              <div className="bg-slate-50/50 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-4 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Thông tin diễn giả</h2>

                {/* Autocomplete Combobox */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-355 uppercase tracking-wider mb-2">
                      Chọn diễn giả *
                    </label>
                    
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Gõ tìm diễn giả (ví dụ: Fernando)..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setShowSuggestions(true)
                          }}
                          onFocus={() => setShowSuggestions(true)}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-slate-400 dark:placeholder-slate-500 text-xs"
                        />
                      </div>

                      {showSuggestions && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowSuggestions(false)}
                          />
                          <div className="absolute z-20 w-full mt-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                            {filteredSuggestions.length > 0 ? (
                              filteredSuggestions.map((sp) => (
                                <div
                                  key={sp.speakerId}
                                  onClick={() => {
                                    handleSelectSpeaker(sp)
                                    setShowSuggestions(false)
                                    setSearchQuery('')
                                  }}
                                  className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer flex items-center gap-3 border-b border-slate-100 dark:border-white/5 last:border-0 text-xs"
                                >
                                  {sp.avatarUrl ? (
                                    <img
                                      src={sp.avatarUrl}
                                      alt={sp.fullName}
                                      className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-white/10"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/20">
                                      {sp.fullName.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-semibold text-xs">{sp.fullName}</p>
                                    <p className="text-[10px] text-slate-550 dark:text-neutral-400">{sp.email || 'Không có email'}</p>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="px-4 py-2.5 text-xs text-slate-500 dark:text-neutral-400 text-center">
                                Không tìm thấy diễn giả nào
                              </div>
                            )}

                            {searchQuery.trim() !== '' && !allSpeakers.some(s => s.fullName.toLowerCase() === searchQuery.trim().toLowerCase()) && (
                              <div
                                onClick={() => {
                                  handleOpenDrawer(searchQuery)
                                  setShowSuggestions(false)
                                }}
                                className="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer border-t border-slate-100 dark:border-white/10 flex items-center text-xs"
                              >
                                + Thêm mới diễn giả "{searchQuery}"
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Selected speaker chips */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedSpeakers.map((sp) => {
                      const currentId = sp.speaker_id || sp.speakerId
                      const avatarUrl = sp.avatar_url || sp.avatarUrl
                      const fullName = sp.full_name || sp.fullName || ''
                      const email = sp.email

                      return (
                        <div
                          key={currentId || 'temp'}
                          className="inline-flex items-center gap-2 bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/10 text-slate-800 dark:text-slate-100 rounded-full pl-2 pr-2.5 py-1 shadow-md"
                        >
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={fullName}
                              className="w-5 h-5 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]">
                              {fullName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="text-[11px]">
                            <span className="font-semibold">{fullName}</span>
                            {email && <span className="text-slate-500 dark:text-neutral-400 ml-1">({email})</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedSpeakers(selectedSpeakers.filter(s => s.speaker_id !== currentId))}
                            className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-slate-400 hover:text-slate-655 dark:hover:text-white transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải: Thông tin vé */}
            <div className="lg:col-span-7 bg-slate-50/50 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-4 shadow-sm">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Thông tin vé</h2>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAddTicket}
                    disabled={tickets.length >= MAX_TICKETS || hasBookings}
                    className={`inline-flex items-center px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors ${tickets.length >= MAX_TICKETS || hasBookings
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 active:scale-95'
                      }`}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Thêm loại vé ({tickets.length}/{MAX_TICKETS})
                  </button>

                  {hasBookings && (
                    <span className="text-[10px] text-red-650 font-bold bg-red-55/20 border border-red-100 dark:border-red-900/40 px-2 py-0.5 rounded">
                      Đã có khách đặt vé
                    </span>
                  )}
                </div>
              </div>

              {/* Ticket Items Grid - Dynamic Columns (no scrollbar) */}
              <div className={`grid gap-4 transition-all duration-300 ${tickets.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {tickets.map((ticket, index) => (
                  <div 
                    key={ticket.name} 
                    className="p-4 border border-gray-200 dark:border-slate-800/85 rounded-lg relative bg-white dark:bg-slate-950/60 shadow-sm space-y-3 transition-all duration-300 hover:shadow-md animate-in fade-in-50 zoom-in-95 duration-200"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-350 uppercase tracking-wider mb-1.5">
                          Loại vé *
                        </label>
                        <select
                          value={ticket.name}
                          onChange={(e) => handleTicketTypeChange(index, e.target.value as TicketType)}
                          disabled={hasBookings}
                          className="w-36 px-2.5 py-1 bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs font-semibold"
                        >
                          <option value="VIP">VIP</option>
                          <option value="STANDARD">STANDARD</option>
                        </select>
                      </div>

                      {tickets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTicket(index)}
                          disabled={hasBookings}
                          className={`p-1.5 rounded-lg transition-colors active:scale-90 ${hasBookings
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20'
                            }`}
                          title={hasBookings ? 'Không thể xóa khi đã có vé được đặt' : 'Xóa loại vé'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* description */}
                      <div>
                        <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-350 uppercase tracking-wider mb-1.5">
                          Mô tả *
                        </label>
                        <textarea
                          value={ticket.description}
                          onChange={(e) => handleTicketChange(index, 'description', e.target.value)}
                          required
                          rows={2}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs resize-none"
                        />
                      </div>

                      {/* price + maxQuantity */}
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-350 uppercase tracking-wider mb-1.5">
                            Giá (VNĐ) *
                          </label>
                          <input
                            type="number"
                            value={ticket.price}
                            onChange={(e) => handleTicketChange(index, 'price', e.target.value)}
                            required
                            min="0"
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-355 uppercase tracking-wider mb-1.5">
                            Số lượng tối đa *
                          </label>
                          <input
                            type="number"
                            value={ticket.maxQuantity}
                            readOnly={hasBookings}
                            onChange={(e) => handleTicketChange(index, 'maxQuantity', e.target.value)}
                            required
                            min="10"
                            step="10"
                            placeholder="10, 20, ..."
                            className={`w-full px-3 py-1.5 border border-gray-300 dark:border-slate-700 rounded-lg text-xs ${hasBookings
                              ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed text-gray-500 dark:text-gray-400'
                              : 'bg-white dark:bg-slate-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                              }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ================= ERROR BOX ================= */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg">
              <p className="text-xs text-red-600 dark:text-red-300 font-semibold">{error}</p>
            </div>
          )}

          {/* ================= BUTTONS ================= */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Link
              to="/dashboard/events"
              className="px-5 py-2 border border-gray-350 dark:border-slate-700 text-gray-750 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-xs font-bold shadow-sm"
            >
              Hủy
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 text-xs font-bold shadow active:scale-95"
            >
              {isSubmitting ? 'Đang cập nhật...' : 'Cập nhật sự kiện'}
            </button>
          </div>
        </form>
      </div>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="h-full w-full max-w-md bg-white dark:bg-neutral-950/95 border-l border-slate-200 dark:border-white/10 p-6 shadow-2xl flex flex-col justify-between text-slate-900 dark:text-white overflow-y-auto animate-in slide-in-from-right duration-300">
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Thêm Diễn Giả Mới</h3>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-200/50 dark:hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Họ và tên */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Họ và tên *
                  </label>
                  <input
                    type="text"
                    required
                    value={drawerFormData.fullName}
                    onChange={(e) => setDrawerFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                    placeholder="Nguyễn Văn A"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={drawerFormData.email}
                    onChange={(e) => setDrawerFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                    placeholder="email@example.com"
                  />
                </div>

                {/* Số điện thoại */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Số điện thoại *
                  </label>
                  <input
                    type="text"
                    required
                    value={drawerFormData.phone}
                    onChange={(e) => setDrawerFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors"
                    placeholder="0912345678"
                  />
                </div>

                {/* Tiểu sử */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Tiểu sử *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={drawerFormData.bio}
                    onChange={(e) => setDrawerFormData(prev => ({ ...prev, bio: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-colors resize-none"
                    placeholder="Thông tin giới thiệu về diễn giả..."
                  />
                </div>

                {/* Ảnh đại diện */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                    Ảnh đại diện
                  </label>
                  <div className="flex items-center gap-4 mt-1">
                    {drawerAvatarPreview ? (
                      <div className="relative">
                        <img
                          src={drawerAvatarPreview}
                          alt="Avatar Preview"
                          className="w-16 h-16 rounded-full object-cover border border-slate-250 dark:border-white/10"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerAvatarFile(null)
                            setDrawerAvatarPreview(null)
                          }}
                          className="absolute -top-1 -right-1 p-0.5 bg-red-600 text-white rounded-full hover:bg-red-505 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 border border-dashed border-slate-250 dark:border-white/10 flex items-center justify-center text-gray-400 dark:text-neutral-500">
                        <User className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <input
                        type="file"
                        id="drawer-avatar-upload"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const validation = validateImageFile(file)
                            if (!validation.valid) {
                              showToast('error', validation.error || 'Ảnh không hợp lệ')
                              return
                            }
                            setDrawerAvatarFile(file)
                            setDrawerAvatarPreview(URL.createObjectURL(file))
                          }
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="drawer-avatar-upload"
                        className="inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold text-slate-700 dark:text-white cursor-pointer transition-colors"
                      >
                        Tải ảnh lên
                      </label>
                      <p className="text-[10px] text-slate-500 dark:text-neutral-400 mt-1">PNG, JPG tối đa 5MB</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t border-slate-150 dark:border-white/5 mt-6">
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold text-slate-700 dark:text-neutral-300 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDrawerSave}
                disabled={drawerSubmitting}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-blue-400 rounded-xl shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {drawerSubmitting && <Loader className="w-4 h-4 mr-2 animate-spin" />}
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
