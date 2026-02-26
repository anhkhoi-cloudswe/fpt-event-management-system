// Import router hooks + Link
import { useParams, useNavigate, Link } from 'react-router-dom'
// useParams: lấy param trên URL (vd /dashboard/events/:id/edit -> lấy id)
// useNavigate: điều hướng trang bằng code
// Link: chuyển trang SPA không reload

// Import icon để UI đẹp hơn
import { Upload, X, Plus, Trash2 } from 'lucide-react'
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

  // ======================= SPEAKER STATE =======================

  // speaker: thông tin diễn giả nhập trên form
  const [speaker, setSpeaker] = useState({
    fullName: '',
    bio: '',
    email: '',
    phone: '',
    avatarUrl: '',
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

  // ======================= AVATAR IMAGE STATE =======================

  // selectedAvatarImage: file avatar diễn giả user chọn
  const [selectedAvatarImage, setSelectedAvatarImage] = useState<File | null>(null)

  // avatarPreview: preview ảnh avatar
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // isDraggingAvatar: UI trạng thái drag-drop avatar
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false)

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
        // lấy token để gọi API
        const token = localStorage.getItem('token')

        // gọi API lấy danh sách event requests của user hiện tại
        const response = await fetch('/api/event-requests/my', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
      const token = localStorage.getItem('token')

      const response = await fetch(`/api/events/detail?id=${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
          setSpeaker({
            fullName: speakerFromApi.fullName || '',
            bio: speakerFromApi.bio || '',
            email: speakerFromApi.email || '',
            phone: speakerFromApi.phone || '',
            avatarUrl: speakerFromApi.avatarUrl || '',
          })
          if (speakerFromApi.avatarUrl) setAvatarPreview(speakerFromApi.avatarUrl)
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

  // handleSpeakerChange: cập nhật từng field của speaker (fullName, bio, email, phone...)
  const handleSpeakerChange = (field: keyof typeof speaker, value: string) => {
    setSpeaker((prev) => ({ ...prev, [field]: value }))
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

  // ======================= HANDLERS: AVATAR IMAGE (SELECT + DRAG DROP) =======================

  // handleAvatarSelect: chọn ảnh avatar từ input, validate và preview
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      return
    }

    setSelectedAvatarImage(file)
    setError(null)

    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // handleRemoveAvatar: xóa avatar preview + reset avatarUrl trong speaker
  const handleRemoveAvatar = () => {
    setSelectedAvatarImage(null)
    setAvatarPreview(null)
    setSpeaker((prev) => ({ ...prev, avatarUrl: '' }))
    setError(null)
  }

  // Drag over avatar box
  const handleAvatarDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingAvatar(true)
  }

  // Drag leave avatar box
  const handleAvatarDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingAvatar(false)
  }

  // Drop avatar image
  const handleAvatarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingAvatar(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file')
      return
    }

    setSelectedAvatarImage(file)
    setError(null)

    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
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

      // ===== UPLOAD BANNER nếu user chọn ảnh mới =====
      let finalBannerUrl = bannerUrl
      if (selectedImage) {
        try {
          console.log('Uploading banner image...')
          finalBannerUrl = await uploadEventBanner(selectedImage)
          console.log('Banner uploaded successfully:', finalBannerUrl)
        } catch (uploadError: any) {
          console.error('Banner upload failed:', uploadError)
          // Show warning but allow form submission to continue
          showToast('warning', 'Không thể tải ảnh banner lên. Sự kiện sẽ giữ nguyên ảnh cũ.')
          // Keep the old banner URL if upload fails
          finalBannerUrl = bannerUrl
        }
      }

      // ===== UPLOAD AVATAR nếu user chọn ảnh avatar mới =====
      let finalAvatarUrl = speaker.avatarUrl
      if (selectedAvatarImage) {
        try {
          console.log('Uploading avatar image...')
          finalAvatarUrl = await uploadEventBanner(selectedAvatarImage)
          console.log('Avatar uploaded successfully:', finalAvatarUrl)
        } catch (uploadError: any) {
          console.error('Avatar upload failed:', uploadError)
          // Show warning but allow form submission to continue
          showToast('warning', 'Không thể tải ảnh avatar lên. Speaker sẽ giữ nguyên ảnh cũ.')
          // Keep the old avatar URL if upload fails
          finalAvatarUrl = speaker.avatarUrl
        }
      }

      // lấy token từ localStorage để gọi API update
      const token = localStorage.getItem('token')

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
        speaker: {
          fullName: speaker.fullName,
          bio: speaker.bio,
          email: speaker.email,
          phone: speaker.phone,
          avatarUrl: finalAvatarUrl,
        },
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
          Authorization: `Bearer ${token}`,
        },
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
      <div className="bg-white rounded-lg shadow-md p-8 max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          Cập nhật thông tin sự kiện
        </h1>

        {/* Banner thông tin: event đang diễn ra thì lock maxQuantity */}
        {isEventOpen && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
            ⚠️ Sự kiện đang diễn ra — không thể thay đổi số lượng vé và thêm/xóa loại vé. Các trường khác vẫn có thể chỉnh sửa.
          </div>
        )}

        {/* Form submit sẽ chạy handleSubmit */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ================= SPEAKER INFO ================= */}
          <div className="border-b pb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Thông tin diễn giả</h2>

            {/* Input speaker fields */}
            <div className="space-y-4">
              {/* fullName */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Họ và tên *
                </label>
                <input
                  type="text"
                  value={speaker.fullName}
                  onChange={(e) => handleSpeakerChange('fullName', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* bio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tiểu sử *
                </label>
                <textarea
                  value={speaker.bio}
                  onChange={(e) => handleSpeakerChange('bio', e.target.value)}
                  required
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* email + phone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={speaker.email}
                    onChange={(e) => handleSpeakerChange('email', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Số điện thoại *
                  </label>
                  <input
                    type="tel"
                    value={speaker.phone}
                    onChange={(e) => handleSpeakerChange('phone', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* avatar upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ảnh đại diện diễn giả (tùy chọn)
                </label>

                {/* Nếu chưa có preview -> show drop zone */}
                {!avatarPreview ? (
                  <div
                    onDragOver={handleAvatarDragOver}
                    onDragLeave={handleAvatarDragLeave}
                    onDrop={handleAvatarDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDraggingAvatar ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                      }`}
                  >
                    <input
                      type="file"
                      id="avatar-upload"
                      accept="image/*"
                      onChange={handleAvatarSelect}
                      className="hidden"
                    />
                    <label htmlFor="avatar-upload" className="cursor-pointer">
                      <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-600 mb-1 text-sm">Kéo thả ảnh hoặc click để chọn</p>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF tối đa 5MB</p>
                    </label>
                  </div>
                ) : (
                  // Nếu đã có preview -> show ảnh + nút xóa
                  <div className="relative">
                    <img
                      src={avatarPreview}
                      alt="Avatar Preview"
                      className="w-32 h-32 object-cover rounded-full mx-auto border-4 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="absolute top-0 right-1/2 translate-x-16 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ================= TICKETS INFO ================= */}
          <div className="border-b pb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Thông tin vé</h2>

              {/* Button thêm loại vé */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAddTicket}
                  disabled={tickets.length >= MAX_TICKETS || hasBookings}
                  className={`inline-flex items-center px-4 py-2 text-white text-sm rounded-lg transition-colors ${tickets.length >= MAX_TICKETS || hasBookings
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                    }`}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Thêm loại vé ({tickets.length}/{MAX_TICKETS})
                </button>

                {/* Thông báo nếu đã có booking */}
                {hasBookings && (
                  <span className="text-sm text-red-600">
                    Đã có khách đặt vé — không thể thay đổi loại vé và số lượng
                  </span>
                )}
              </div>
            </div>

            {/* Render từng ticket */}
            {tickets.map((ticket, index) => (
              <div key={index} className="mb-6 p-4 border border-gray-200 rounded-lg relative">
                {/* Ticket type + nút xóa */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Loại vé *
                    </label>
                    <select
                      value={ticket.name}
                      onChange={(e) => handleTicketTypeChange(index, e.target.value as TicketType)}
                      className="w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="VIP">VIP</option>
                      <option value="STANDARD">STANDARD</option>
                    </select>
                  </div>

                  {/* Nút xóa ticket (chỉ show nếu >1 ticket) */}
                  {tickets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTicket(index)}
                      disabled={hasBookings}
                      className={`p-2 rounded-lg transition-colors ${hasBookings
                        ? 'text-gray-400 hover:bg-transparent cursor-not-allowed'
                        : 'text-red-600 hover:bg-red-50'
                        }`}
                      title={hasBookings ? 'Không thể xóa khi đã có vé được đặt' : 'Xóa loại vé'}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Ticket fields */}
                <div className="space-y-4">
                  {/* description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mô tả *
                    </label>
                    <textarea
                      value={ticket.description}
                      onChange={(e) => handleTicketChange(index, 'description', e.target.value)}
                      required
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* price + maxQuantity */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* price */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Giá (VNĐ) *
                      </label>
                      <input
                        type="number"
                        value={ticket.price}
                        onChange={(e) => handleTicketChange(index, 'price', e.target.value)}
                        required
                        min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* maxQuantity */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Số lượng tối đa *
                      </label>
                      <input
                        type="number"
                        value={ticket.maxQuantity}
                        readOnly={hasBookings} // Đã có booking thì khóa maxQuantity
                        onChange={(e) => handleTicketChange(index, 'maxQuantity', e.target.value)}
                        required
                        min="10"
                        step="10"
                        placeholder="10, 20, 30, ..."
                        title={hasBookings ? 'Không thể thay đổi số lượng vé khi đã có khách đặt vé' : ''}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg ${hasBookings
                          ? 'bg-gray-100 cursor-not-allowed'
                          : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                          }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ================= BANNER UPLOAD ================= */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Banner sự kiện *
            </label>

            {/* Nếu chưa có preview -> show dropzone */}
            {!imagePreview ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
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
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">Kéo thả ảnh hoặc click để chọn</p>
                  <p className="text-sm text-gray-500">PNG, JPG, GIF tối đa 5MB</p>
                </label>
              </div>
            ) : (
              // Nếu có preview -> show ảnh + nút xóa
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="w-full h-64 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ================= ERROR BOX ================= */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* ================= BUTTONS ================= */}
          <div className="flex justify-end gap-4 pt-4">
            {/* Cancel -> về danh sách event */}
            <Link
              to="/dashboard/events"
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Hủy
            </Link>

            {/* Submit update */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {isSubmitting ? 'Đang cập nhật...' : 'Cập nhật sự kiện'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
