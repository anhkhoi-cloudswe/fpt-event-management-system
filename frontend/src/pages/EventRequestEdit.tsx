// Import router hooks + Link
import { useParams, useNavigate, Link } from 'react-router-dom'
// useParams: lấy param trên URL (vd /dashboard/event-requests/:id/edit -> lấy id)
// useNavigate: điều hướng trang bằng code
// Link: chuyển trang SPA không reload

// Import icon để UI đẹp hơn
import { Upload, X, Plus, Trash2, Loader } from 'lucide-react'
// Upload: icon upload ảnh
// X: icon đóng / xóa ảnh
// Plus: icon thêm vé
// Trash2: icon xóa loại vé
// Loader: icon loading spinner

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

// Speaker info
type Speaker = {
    fullName: string
    bio: string
    email: string
    phone: string
    avatarUrl: string
}

// Event request structure
type EventRequest = {
    requestId: number
    createdEventId?: number // ✅ NEW: For APPROVED requests with created event
    title: string
    description: string
    reason?: string
    preferredStartTime: string
    preferredEndTime: string
    expectedCapacity: number
    status: string
}

export default function EventRequestEdit() {
    // ======================= ROUTER + CONTEXT =======================

    // Lấy id (requestId) từ URL param
    const { id } = useParams<{ id: string }>()

    // navigate: chuyển trang bằng code
    const navigate = useNavigate()

    // showToast: hiển thị toast message
    const { showToast } = useToast()

    // ======================= STATE CHUNG =======================

    // loading: đang load dữ liệu (fetch event request + event details)
    const [loading, setLoading] = useState(false)

    // isSubmitting: trạng thái đang submit form update (disable nút)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // error: lỗi tổng (validate hoặc API fail)
    const [error, setError] = useState<string | null>(null)

    // ✅ NEW: datetimeValidationError - kiểm tra datetime fields có trống không
    const [datetimeValidationError, setDatetimeValidationError] = useState<string | null>(null)

    // expectedCapacity: số lượng dự kiến từ "event request" (để giới hạn tổng số vé)
    const [expectedCapacity, setExpectedCapacity] = useState<number>(0)

    // eligibilityError: lỗi từ kiểm tra tính khả thi cập nhật
    const [eligibilityError, setEligibilityError] = useState<string | null>(null)

    // ======================= FORM STATE =======================

    // eventRequest: dữ liệu request (title, description, dates, capacity...)
    const [eventRequest, setEventRequest] = useState<EventRequest>({
        requestId: 0,
        title: '',
        description: '',
        preferredStartTime: '',
        preferredEndTime: '',
        expectedCapacity: 0,
        status: 'APPROVED',
    })

    // ======================= SPEAKER STATE =======================

    // speaker: thông tin diễn giả nhập trên form
    const [speaker, setSpeaker] = useState<Speaker>({
        fullName: '',
        bio: '',
        email: '',
        phone: '',
        avatarUrl: '',
    })

    // ======================= TICKET STATE =======================

    // tickets: danh sách loại vé
    // Default tạo sẵn 2 loại VIP + STANDARD để user nhập nhanh
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

    // hasShownWarningRef: dùng để chặn việc toast warning bị spam liên tục khi user nhập maxQuantity
    const hasShownWarningRef = useRef(false)

    // ======================= 1) FETCH EVENT REQUEST DATA =======================

    useEffect(() => {
        if (id) {
            setLoading(true)
            fetchEventRequestData()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    /**
     * fetchEventRequestData:
     * ✅ UPDATED: Sử dụng endpoint riêng GET /api/event-requests/{id} để lấy dữ liệu chi tiết
     * - Endpoint này JOIN với Event, VenueArea, Venue để lấy đầy đủ thông tin datetime
     * - Tránh lỗi datetime rỗng khi dữ liệu từ list endpoint không đầy đủ
     */
    const fetchEventRequestData = async () => {
        try {
            const token = localStorage.getItem('token')

            // ✅ NEW: Gọi API chi tiết request (thay vì dùng list và tìm)
            // Endpoint này trả về dữ liệu đầy đủ với datetime fields được JOIN từ Event
            const detailResponse = await fetch(`/api/event-requests/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (!detailResponse.ok) {
                throw new Error('Failed to fetch event request details')
            }

            const detailedRequest = await detailResponse.json()
            console.log('[EventRequestEdit] Data from GET /api/event-requests/:id:', JSON.stringify(detailedRequest, null, 2))
            console.log('[EventRequestEdit] Speaker object:', detailedRequest.speaker)

            // Pre-fill form data từ request chi tiết
            // ✅ Đảm bảo preferredStartTime + preferredEndTime không rỗng
            setEventRequest({
                requestId: detailedRequest.requestId,
                createdEventId: detailedRequest.createdEventId, // ✅ NEW: Capture for backend update
                title: detailedRequest.title || '',
                description: detailedRequest.description || '',
                preferredStartTime: detailedRequest.preferredStartTime || '',
                preferredEndTime: detailedRequest.preferredEndTime || '',
                expectedCapacity: detailedRequest.expectedCapacity || 0,
                status: detailedRequest.status || 'APPROVED',
            })

            // ✅ NEW: Validate datetime fields
            if (!detailedRequest.preferredStartTime || !detailedRequest.preferredEndTime) {
                setDatetimeValidationError('Thông tin thời gian không đầy đủ. Vui lòng liên hệ bộ phận hỗ trợ.')
            }

            const matchingRequest = detailedRequest

            // Lưu expectedCapacity cho validation
            setExpectedCapacity(matchingRequest.expectedCapacity || 0)

            // ===== PRE-FILL FROM DETAILED REQUEST =====
            // Load speaker, banner, and tickets from the event-request API response immediately
            // Use local flags to remember which fields were filled so we don't overwrite
            // them later when fetching event-level data.
            let speakerLoaded = false
            let bannerLoaded = false
            let ticketsLoaded = false

            if (matchingRequest.speaker) {
                const s = matchingRequest.speaker
                setSpeaker({
                    fullName: s.fullName || '',
                    bio: s.bio || '',
                    email: s.email || '',
                    phone: s.phone || '',
                    avatarUrl: s.avatarUrl || '',
                })
                if (s.avatarUrl) {
                    setAvatarPreview(s.avatarUrl)
                }
                speakerLoaded = Boolean(s.fullName || s.bio || s.email || s.phone || s.avatarUrl)
            }

            if (matchingRequest.bannerUrl) {
                setBannerUrl(matchingRequest.bannerUrl)
                setImagePreview(matchingRequest.bannerUrl)
                bannerLoaded = true
            }

            if (Array.isArray(matchingRequest.tickets) && matchingRequest.tickets.length > 0) {
                const mapped = matchingRequest.tickets.map((tk: any) => ({
                    name: tk.name || 'STANDARD',
                    description: tk.description || '',
                    price: Math.round(Number(tk.price)) || 0,
                    maxQuantity: Number(tk.maxQuantity) || 0,
                    status: tk.status || 'ACTIVE',
                }))
                setTickets(mapped)
                ticketsLoaded = true
            }

            // ===== ELIGIBILITY CHECK =====
            // Kiểm tra xem sự kiện có thể cập nhật được không
            if (matchingRequest.createdEventId) {
                try {
                    // Kiểm tra tính khả thi: status và thời gian
                    const finishedStatuses = ['CLOSED', 'CANCELLED', 'FINISHED']

                    const eventResponse = await fetch(`/api/events/detail?id=${matchingRequest.createdEventId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })

                    if (eventResponse.ok) {
                        const eventData = await eventResponse.json()

                        // Check 1: Event status
                        if (eventData.status && finishedStatuses.includes(eventData.status.toUpperCase())) {
                            setEligibilityError('Sự kiện đã kết thúc hoặc bị hủy, không thể cập nhật')
                            setLoading(false)
                            return
                        }

                        // Check 2: 24-hour rule
                        if (eventData.startTime) {
                            const startTime = new Date(eventData.startTime)
                            const now = new Date()
                            const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)

                            if (hoursUntilStart < 24) {
                                setEligibilityError('Chỉ được phép cập nhật thông tin sự kiện trước khi bắt đầu ít nhất 24 tiếng')
                                setLoading(false)
                                return
                            }
                        }
                    } else {
                        // Event endpoint error, continue to show form but eligibility will be checked on backend
                        console.warn('Could not fetch event details for eligibility check, backend will validate')
                    }
                } catch (eligibilityError) {
                    console.warn('Error checking eligibility:', eligibilityError)
                    // Continue to show form, backend will validate
                }
            }

            // Bước 2 (tiếp tục): Nếu request có createdEventId, gọi API chi tiết event để pre-fill data
            if (matchingRequest.createdEventId) {
                try {
                    const eventResponse = await fetch(`/api/events/detail?id=${matchingRequest.createdEventId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })

                    if (eventResponse.ok) {
                        const eventData = await eventResponse.json()
                        console.log('[EventRequestEdit] Event details from /api/events/detail:', JSON.stringify(eventData, null, 2))
                        console.log('[EventRequestEdit] Speaker fields:', {
                            speakerName: eventData.speakerName,
                            speakerBio: eventData.speakerBio,
                            speakerEmail: eventData.speakerEmail,
                            speakerPhone: eventData.speakerPhone,
                            speakerAvatarUrl: eventData.speakerAvatarUrl
                        })

                        // Pre-fill banner
                        if (eventData.bannerUrl) {
                            setBannerUrl(eventData.bannerUrl)
                            setImagePreview(eventData.bannerUrl)
                        }

                        // ✅ FIX: Map đúng tên field từ Backend JSON
                        // Backend trả về: speakerName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl
                        const speakerFromApi = {
                            fullName: eventData.speakerName || '',
                            bio: eventData.speakerBio || '',
                            email: eventData.speakerEmail || '',
                            phone: eventData.speakerPhone || '',
                            avatarUrl: eventData.speakerAvatarUrl || '',
                        }

                        console.log('[EventRequestEdit] Mapped speaker object:', speakerFromApi)

                        if (speakerFromApi.fullName || speakerFromApi.bio || speakerFromApi.email) {
                            // Only set speaker if it wasn't already filled from the request
                            if (!speakerLoaded) {
                                console.log('[EventRequestEdit] Setting speaker state with:', speakerFromApi)
                                setSpeaker(speakerFromApi)
                                if (speakerFromApi.avatarUrl) setAvatarPreview(speakerFromApi.avatarUrl)
                                speakerLoaded = true
                            } else {
                                console.log('[EventRequestEdit] Speaker already loaded from request, skipping event data')
                            }
                        } else {
                            console.warn('[EventRequestEdit] No valid speaker data found in event response')
                        }

                        // Pre-fill tickets nếu có
                        if (Array.isArray(eventData.tickets) && eventData.tickets.length > 0) {
                            // Only overwrite tickets if they weren't already loaded from the request
                            if (!ticketsLoaded) {
                                const mapped = eventData.tickets.map((tk: any) => ({
                                    name: tk.name || 'STANDARD',
                                    description: tk.description || '',
                                    price: Math.round(Number(tk.price)) || 0,
                                    maxQuantity: Number(tk.maxQuantity) || 0,
                                    status: tk.status || 'ACTIVE',
                                }))
                                setTickets(mapped)
                                ticketsLoaded = true
                            }
                        }
                    }
                } catch (eventError) {
                    console.error('Error fetching event details:', eventError)
                    // Không fail whole page, chỉ warn user
                    showToast('warning', 'Không thể tải chi tiết sự kiện. Vui lòng điền thông tin thủ công.')
                }
            }
        } catch (error) {
            console.error('Error fetching event request:', error)
            setError(error instanceof Error ? error.message : 'Đã xảy ra lỗi khi tải dữ liệu')
        } finally {
            setLoading(false)
        }
    }

    // ======================= HANDLERS: EVENT REQUEST =======================

    // handleRequestChange: cập nhật field của event request
    const handleRequestChange = (field: keyof EventRequest, value: string | number) => {
        setEventRequest((prev) => ({ ...prev, [field]: value }))
        // ✅ NEW: Reset datetime validation error khi user thay đổi field
        if (field === 'preferredStartTime' || field === 'preferredEndTime') {
            setDatetimeValidationError(null)
        }
    }

    // ======================= HANDLERS: SPEAKER =======================

    // handleSpeakerChange: cập nhật từng field của speaker
    const handleSpeakerChange = (field: keyof Speaker, value: string) => {
        setSpeaker((prev) => ({ ...prev, [field]: value }))
    }

    // ======================= HANDLERS: TICKET =======================

    // handleTicketChange: cập nhật field của 1 ticket theo index
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

            // Validate capacity khi đổi maxQuantity
            if (field === 'maxQuantity' && expectedCapacity > 0) {
                let numValue = typeof value === 'string' ? parseInt(value, 10) : value

                if (isNaN(numValue) || numValue < 0) {
                    numValue = 0
                }

                const totalMaxQuantity = updated.reduce((sum, ticket) => {
                    return sum + (Number(ticket.maxQuantity) || 0)
                }, 0)

                if (totalMaxQuantity > expectedCapacity) {
                    if (!hasShownWarningRef.current) {
                        showToast(
                            'warning',
                            `Tổng số lượng tối đa của tất cả vé (${totalMaxQuantity}) không được vượt quá ${expectedCapacity} (số lượng dự kiến từ yêu cầu)`,
                        )
                        hasShownWarningRef.current = true

                        setTimeout(() => {
                            hasShownWarningRef.current = false
                        }, 2000)
                    }

                    updated[index] = prev[index]
                    return updated
                }
            }

            return updated
        })
    }

    const MAX_TICKETS = 2

    // handleAddTicket: thêm 1 loại vé mới
    const handleAddTicket = () => {
        if (tickets.length >= MAX_TICKETS) {
            showToast('warning', `Tối đa chỉ được thêm ${MAX_TICKETS} loại vé`)
            return
        }

        const existingTypes = tickets.map(t => t.name)
        let newTicketName: TicketType

        if (existingTypes.includes('VIP') && !existingTypes.includes('STANDARD')) {
            newTicketName = 'STANDARD'
        } else if (existingTypes.includes('STANDARD') && !existingTypes.includes('VIP')) {
            newTicketName = 'VIP'
        } else {
            newTicketName = existingTypes.includes('VIP') ? 'STANDARD' : 'VIP'
        }

        setTickets((prev) => [
            ...prev,
            { name: newTicketName, description: '', price: 0, maxQuantity: 0, status: 'ACTIVE' },
        ])
    }

    // handleRemoveTicket: xóa loại vé theo index
    const handleRemoveTicket = (index: number) => {
        if (tickets.length <= 1) {
            setError('Phải có ít nhất 1 loại vé')
            return
        }
        setTickets((prev) => prev.filter((_, i) => i !== index))
    }

    // handleTicketTypeChange: đổi name VIP/STANDARD cho ticket
    const handleTicketTypeChange = (index: number, newType: TicketType) => {
        setTickets((prev) => {
            const isDuplicate = prev.some((ticket, i) => i !== index && ticket.name === newType)

            if (isDuplicate) {
                showToast('warning', `Loại vé ${newType} đã tồn tại. Vui lòng chọn loại vé khác.`)
                return prev
            }

            const updated = [...prev]
            updated[index] = { ...updated[index], name: newType }
            return updated
        })
    }

    // ======================= HANDLERS: BANNER IMAGE =======================

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const validation = validateImageFile(file)
        if (!validation.valid) {
            setError(validation.error || 'Invalid file')
            return
        }

        // Revoke old object URL if it exists
        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview)
        }

        setSelectedImage(file)
        setError(null)

        // Use URL.createObjectURL for preview (delayed upload)
        const objectUrl = URL.createObjectURL(file)
        setImagePreview(objectUrl)
    }

    const handleRemoveImage = () => {
        // Revoke object URL if it's a blob URL
        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview)
        }

        setSelectedImage(null)
        setImagePreview(null)
        setBannerUrl('')
        setError(null)
    }

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

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

        // Revoke old object URL if it exists
        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview)
        }

        setSelectedImage(file)
        setError(null)

        // Use URL.createObjectURL for preview (delayed upload)
        const objectUrl = URL.createObjectURL(file)
        setImagePreview(objectUrl)
    }

    // ======================= HANDLERS: AVATAR IMAGE =======================

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const validation = validateImageFile(file)
        if (!validation.valid) {
            setError(validation.error || 'Invalid file')
            return
        }

        // Revoke old object URL if it exists
        if (avatarPreview && avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview)
        }

        setSelectedAvatarImage(file)
        setError(null)

        // Use URL.createObjectURL for preview (delayed upload)
        const objectUrl = URL.createObjectURL(file)
        setAvatarPreview(objectUrl)
    }

    const handleRemoveAvatar = () => {
        // Revoke object URL if it's a blob URL
        if (avatarPreview && avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview)
        }

        setSelectedAvatarImage(null)
        setAvatarPreview(null)
        setSpeaker((prev) => ({ ...prev, avatarUrl: '' }))
        setError(null)
    }

    const handleAvatarDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingAvatar(true)
    }

    const handleAvatarDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingAvatar(false)
    }

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

        // Revoke old object URL if it exists
        if (avatarPreview && avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview)
        }

        setSelectedAvatarImage(file)
        setError(null)

        // Use URL.createObjectURL for preview (delayed upload)
        const objectUrl = URL.createObjectURL(file)
        setAvatarPreview(objectUrl)
    }

    // ======================= SUBMIT FORM =======================

    /**
     * ✅ NEW: 3-Step Atomic Update Flow (Zero-Waste Upload)
     * 
     * Step 1 (Check): 
     *   - Validate form locally
     *   - Call API with dryRun: true
     *   - If error → show error, STOP (no uploads)
     *   - If OK → proceed to Step 2
     *
     * Step 2 (Upload):
     *   - Upload banner to Supabase (if new)
     *   - Upload avatar to Supabase (if new)
     *   - If any upload fails → show warning, continue with old URLs
     *
     * Step 3 (Commit):
     *   - Call API with dryRun: false + new image URLs
     *   - Persist changes to database
     *   - Navigate back to list
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        // ✅ NEW: Validate datetime fields trước khi submit
        if (!eventRequest.preferredStartTime || !eventRequest.preferredEndTime) {
            setError('Thời gian bắt đầu và kết thúc không được để trống')
            setDatetimeValidationError('Vui lòng chắc chắn rằng dữ liệu thời gian đã được tải đầy đủ')
            setIsSubmitting(false)
            return
        }

        try {
            // ===== VALIDATE SPEAKER INFO =====
            if (!speaker.fullName || speaker.fullName.trim() === '') {
                setError('Vui lòng nhập họ tên diễn giả')
                setIsSubmitting(false)
                return
            }

            if (!speaker.bio || speaker.bio.trim() === '') {
                setError('Vui lòng nhập tiểu sử diễn giả')
                setIsSubmitting(false)
                return
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!speaker.email || !emailRegex.test(speaker.email)) {
                setError('Vuii lòng nhập email hợp lệ (ví dụ: nguoi@gmail.com)')
                setIsSubmitting(false)
                return
            }

            // Validate phone format (Vietnamese phone: 10 digits starting with 0, or +84)
            const phoneRegex = /^(\+84|0)?[1-9]\d{8,9}$/
            if (!speaker.phone || !phoneRegex.test(speaker.phone.replace(/\s/g, ''))) {
                setError('Vui lòng nhập số điện thoại hợp lệ (ví dụ: 0912345678)')
                setIsSubmitting(false)
                return
            }

            // Validate: tổng số vé không vượt expectedCapacity
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

            const token = localStorage.getItem('token')

            // ===== STEP 1: DRY RUN - Validate without committing =====
            console.log('[STEP 1] Validating form data...')
            showToast('info', 'Đang kiểm tra thông tin...')

            const dryRunRequest: any = {
                requestId: eventRequest.requestId,
                speaker: {
                    fullName: speaker.fullName,
                    bio: speaker.bio,
                    email: speaker.email,
                    phone: speaker.phone,
                    avatarUrl: speaker.avatarUrl, // Use current URL for dry run
                },
                tickets: tickets.map((ticket) => ({
                    name: ticket.name,
                    description: ticket.description,
                    price: Number(ticket.price),
                    maxQuantity: Number(ticket.maxQuantity),
                    status: 'ACTIVE',
                })),
                bannerUrl: bannerUrl, // Use current URL for dry run
                status: 'UPDATING',
                dryRun: true, // ✅ NEW: Dry run mode
            }

            if (eventRequest.status === 'APPROVED' && eventRequest.createdEventId) {
                dryRunRequest.eventId = eventRequest.createdEventId
            }

            const dryRunResponse = await fetch(`/api/event-requests/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(dryRunRequest),
            })

            if (!dryRunResponse.ok) {
                // ❌ Dry run failed - validation error, NO uploads happen
                const errorText = await dryRunResponse.text()
                console.error('[STEP 1] DRY RUN FAILED:', errorText)
                setError(errorText || 'Lỗi kiểm tra thông tin: dữ liệu không hợp lệ')
                showToast('error', `Kiểm tra thất bại: ${errorText || 'dữ liệu không hợp lệ'}`)
                setIsSubmitting(false)
                return
            }

            console.log('[STEP 1] ✅ Dry run passed, proceeding to upload images')
            showToast('success', 'Kiểm tra thông tin thành công')

            // ===== STEP 2: UPLOAD IMAGES =====
            console.log('[STEP 2] Uploading images to Supabase...')
            let finalBannerUrl = bannerUrl
            let finalAvatarUrl = speaker.avatarUrl

            if (selectedImage) {
                try {
                    console.log('[STEP 2] Uploading banner...')
                    finalBannerUrl = await uploadEventBanner(selectedImage)
                    console.log('[STEP 2] ✅ Banner uploaded:', finalBannerUrl)
                } catch (uploadError: any) {
                    console.error('[STEP 2] Banner upload failed:', uploadError)
                    showToast('warning', 'Không thể tải ảnh banner lên, sẽ giữ ảnh cũ')
                    finalBannerUrl = bannerUrl
                }
            }

            if (selectedAvatarImage) {
                try {
                    console.log('[STEP 2] Uploading avatar...')
                    finalAvatarUrl = await uploadEventBanner(selectedAvatarImage)
                    console.log('[STEP 2] ✅ Avatar uploaded:', finalAvatarUrl)
                } catch (uploadError: any) {
                    console.error('[STEP 2] Avatar upload failed:', uploadError)
                    showToast('warning', 'Không thể tải ảnh avatar lên, sẽ giữ ảnh cũ')
                    finalAvatarUrl = speaker.avatarUrl
                }
            }

            // ===== STEP 3: COMMIT - Final API call with images =====
            console.log('[STEP 3] Committing changes to database...')
            showToast('info', 'Đang lưu thay đổi...')

            const commitRequest: any = {
                requestId: eventRequest.requestId,
                speaker: {
                    fullName: speaker.fullName,
                    bio: speaker.bio,
                    email: speaker.email,
                    phone: speaker.phone,
                    avatarUrl: finalAvatarUrl, // ✅ Use uploaded URL or old URL
                },
                tickets: tickets.map((ticket) => ({
                    name: ticket.name,
                    description: ticket.description,
                    price: Number(ticket.price),
                    maxQuantity: Number(ticket.maxQuantity),
                    status: 'ACTIVE',
                })),
                bannerUrl: finalBannerUrl, // ✅ Use uploaded URL or old URL
                status: 'UPDATING',
                dryRun: false, // ✅ Commit to database
            }

            if (eventRequest.status === 'APPROVED' && eventRequest.createdEventId) {
                commitRequest.eventId = eventRequest.createdEventId
            }

            const commitResponse = await fetch(`/api/event-requests/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(commitRequest),
            })

            const commitText = await commitResponse.text()
            console.log('[STEP 3] API Response:', commitResponse.status, commitText)

            if (commitResponse.ok) {
                console.log('[STEP 3] ✅ Commit successful')
                showToast('success', 'Cập nhật yêu cầu thành công! Trạng thái chuyển sang UPDATING.')
                await new Promise(resolve => setTimeout(resolve, 500))
                navigate('/dashboard/event-requests')
            } else {
                console.error('[STEP 3] Commit failed:', commitText)
                setError(commitText || 'Không thể lưu thay đổi')
                showToast('error', commitText || 'Lỗi khi lưu thay đổi')
                throw new Error(commitText || 'Failed to commit changes')
            }
        } catch (error) {
            console.error('Error in update flow:', error)
            setError(error instanceof Error ? error.message : 'Không thể cập nhật yêu cầu')
            showToast('error', error instanceof Error ? error.message : 'Lỗi không xác định')
        } finally {
            setIsSubmitting(false)
        }
    }

    // ======================= RENDER =======================

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <p className="text-gray-500">Đang tải...</p>
            </div>
        )
    }

    // If eligibility check failed, show error and prevent form submission
    if (eligibilityError) {
        return (
            <div className="flex justify-center">
                <div className="bg-white rounded-lg shadow-md p-8 max-w-4xl w-full">
                    <div className="flex justify-center mb-6">
                        <div className="text-6xl">🚫</div>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
                        Không thể cập nhật yêu cầu
                    </h1>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
                        <p className="text-red-800 text-center font-medium text-lg">
                            {eligibilityError}
                        </p>
                    </div>

                    <p className="text-gray-600 text-center mb-8">
                        Theo quy định nghiệp vụ, sự kiện không đáp ứng các điều kiện cập nhật.
                    </p>

                    <div className="flex justify-center">
                        <Link
                            to="/dashboard/event-requests"
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            ← Quay lại danh sách yêu cầu
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex justify-center">
            <div className="bg-white rounded-lg shadow-md p-8 max-w-4xl w-full">
                <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
                    Cập nhật yêu cầu tổ chức sự kiện
                </h1>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* ================= SPEAKER INFO ================= */}
                    <div className="border-b pb-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Thông tin diễn giả</h2>

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

                            <button
                                type="button"
                                onClick={handleAddTicket}
                                disabled={tickets.length >= MAX_TICKETS}
                                className={`inline-flex items-center px-4 py-2 text-white text-sm rounded-lg transition-colors ${tickets.length >= MAX_TICKETS
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700'
                                    }`}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Thêm loại vé ({tickets.length}/{MAX_TICKETS})
                            </button>
                        </div>

                        {tickets.map((ticket, index) => (
                            <div key={index} className="mb-6 p-4 border border-gray-200 rounded-lg relative">
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

                                    {tickets.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTicket(index)}
                                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>

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

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Số lượng tối đa *
                                            </label>
                                            <input
                                                type="number"
                                                value={ticket.maxQuantity}
                                                onChange={(e) => handleTicketChange(index, 'maxQuantity', e.target.value)}
                                                required
                                                min="10"
                                                step="10"
                                                placeholder="10, 20, 30, ..."
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                        <Link
                            to="/dashboard/event-requests"
                            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Hủy
                        </Link>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`inline-flex items-center gap-2 px-6 py-2 text-white rounded-lg transition-colors ${isSubmitting
                                ? 'bg-blue-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
                            {isSubmitting ? 'Đang xử lý...' : 'Cập nhật yêu cầu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
