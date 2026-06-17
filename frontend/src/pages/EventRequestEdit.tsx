// Import router hooks + Link
import { useParams, useNavigate, Link } from 'react-router-dom'
// useParams: lấy param trên URL (vd /dashboard/event-requests/:id/edit -> lấy id)
// useNavigate: điều hướng trang bằng code
// Link: chuyển trang SPA không reload

// Import icon để UI đẹp hơn
import { Upload, X, Plus, Trash2, Loader, Search, User } from 'lucide-react'
// Upload: icon upload ảnh
// X: icon đóng / xóa ảnh
// Plus: icon thêm vé
// Trash2: icon xóa loại vé
// Loader: icon loading spinner
// Search: icon search
// User: icon user

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

    // ======================= CHOSEN SPEAKERS STATE =======================
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



    // ======================= CONSTANTS =======================

    // MAX_TICKET_PRICE: Maximum allowed ticket price (100 million VNĐ)
    const MAX_TICKET_PRICE = 100000000
    const MAX_PRICE_DIGITS = 999999999 // Max value for input display (9 digits)

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


            // ✅ NEW: Gọi API chi tiết request (thay vì dùng list và tìm)
            // Endpoint này trả về dữ liệu đầy đủ với datetime fields được JOIN từ Event
            const detailResponse = await fetch(`/api/event-requests/${id}`, {
                headers: {
                    credentials: 'include',
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

            if (matchingRequest.speaker && (matchingRequest.speaker.fullName || matchingRequest.speaker.bio || matchingRequest.speaker.email)) {
                const s = matchingRequest.speaker
                const loadedSpeaker = {
                    speakerId: s.speakerId || s.speaker_id || undefined,
                    speaker_id: s.speakerId || s.speaker_id || undefined,
                    fullName: s.fullName || s.full_name || '',
                    full_name: s.fullName || s.full_name || '',
                    bio: s.bio || '',
                    email: s.email || '',
                    phone: s.phone || '',
                    avatarUrl: s.avatarUrl || s.avatar_url || '',
                    avatar_url: s.avatarUrl || s.avatar_url || '',
                }
                setSelectedSpeakers([loadedSpeaker])
                speakerLoaded = true
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
                            credentials: 'include',
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
                            credentials: 'include',
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
                        const speakerFromApi = {
                            speakerId: eventData.speakerId || eventData.speaker_id || undefined,
                            speaker_id: eventData.speakerId || eventData.speaker_id || undefined,
                            fullName: eventData.speakerName || eventData.fullName || eventData.full_name || '',
                            full_name: eventData.speakerName || eventData.fullName || eventData.full_name || '',
                            bio: eventData.speakerBio || '',
                            email: eventData.speakerEmail || '',
                            phone: eventData.speakerPhone || '',
                            avatarUrl: eventData.speakerAvatarUrl || eventData.avatarUrl || eventData.avatar_url || '',
                            avatar_url: eventData.speakerAvatarUrl || eventData.avatarUrl || eventData.avatar_url || '',
                        }

                        console.log('[EventRequestEdit] Mapped speaker object:', speakerFromApi)

                        if (speakerFromApi.fullName || speakerFromApi.bio || speakerFromApi.email) {
                            // Only set speaker if it wasn't already filled from the request
                            if (!speakerLoaded) {
                                console.log('[EventRequestEdit] Setting selectedSpeakers state with:', speakerFromApi)
                                setSelectedSpeakers([speakerFromApi])
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

            // ✅ NEW: Validate ticket price
            if (field === 'price') {
                let numValue = convertedValue as number

                // Limit to 9 digits max
                if (numValue > MAX_PRICE_DIGITS) {
                    numValue = MAX_PRICE_DIGITS
                }

                // Show warning if price exceeds MAX_TICKET_PRICE
                if (numValue > MAX_TICKET_PRICE) {
                    showToast(
                        'error',
                        `⚠️ Giá vé không được vượt quá ${MAX_TICKET_PRICE.toLocaleString('vi-VN')} VNĐ (100 triệu)`
                    )
                }

                updated[index] = { ...updated[index], price: numValue }
            } else {
                // cập nhật ticket tại index
                updated[index] = { ...updated[index], [field]: convertedValue }
            }

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
     *   - Upload banner to AWS S3 via backend (if new)
     *   - Upload avatar to AWS S3 via backend (if new)
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
            if (selectedSpeakers.length === 0) {
                setError('Vui lòng chọn hoặc thêm diễn giả')
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

            const activeSpeaker = selectedSpeakers[0]

            // ===== STEP 1: DRY RUN - Validate without committing =====
            console.log('[STEP 1] Validating form data...')
            showToast('info', 'Đang kiểm tra thông tin...')

            const dryRunRequest: any = {
                requestId: eventRequest.requestId,
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
                    credentials: 'include',
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

            // ===== STEP 3: COMMIT - Final API call with images =====
            console.log('[STEP 3] Committing changes to database...')
            showToast('info', 'Đang lưu thay đổi...')

            const commitRequest: any = {
                requestId: eventRequest.requestId,
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
                    credentials: 'include',
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

    // Helper to archive request that is past the update deadline
    const archivePastDeadlineRequest = (requestId: number) => {
        console.log(`[archivePastDeadlineRequest] Archiving request ID: ${requestId}`)
        const archivedStr = localStorage.getItem('client_archived_requests') || '{}'
        try {
            const archived = JSON.parse(archivedStr)
            archived[requestId] = true
            localStorage.setItem('client_archived_requests', JSON.stringify(archived))
        } catch (e) {
            console.error('Error in state cleanup hook:', e)
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
                <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg shadow-md p-8 max-w-4xl w-full">
                    <div className="flex justify-center mb-6">
                        <div className="text-6xl">🚫</div>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
                        Không thể cập nhật yêu cầu
                    </h1>

                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-6 mb-8">
                        <p className="text-red-800 dark:text-red-400 text-center font-medium text-lg">
                            {eligibilityError}
                        </p>
                    </div>

                    <p className="text-gray-600 dark:text-slate-400 text-center mb-6">
                        Yêu cầu này không đủ điều kiện để chỉnh sửa tại thời điểm này.
                    </p>
                    <div className="flex justify-center">
                        <Link
                            to="/dashboard/event-requests"
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors active:scale-95 shadow"
                        >
                            Quay lại danh sách
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex justify-center">
            <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-lg shadow-md p-6 max-w-6xl w-full">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
                    Cập nhật yêu cầu tổ chức sự kiện
                </h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                        {/* Cột trái: Banner & Diễn giả */}
                        <div className="lg:col-span-5 space-y-4">
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
                        <div
                            onClick={() => {
                                handleOpenDrawer(searchQuery)
                                setShowSuggestions(false)
                            }}
                            className="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-semibold cursor-pointer border-t border-slate-100 dark:border-white/10 flex items-center gap-1.5 text-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Thêm diễn giả mới {searchQuery.trim() ? `"${searchQuery}"` : ''}
                        </div>
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
                        <div className="lg:col-span-7 bg-slate-50/50 dark:bg-slate-900/40 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-3 shadow-sm">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Thông tin vé</h2>

                                <button
                                    type="button"
                                    onClick={handleAddTicket}
                                    disabled={tickets.length >= MAX_TICKETS}
                                    className={`inline-flex items-center px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors ${tickets.length >= MAX_TICKETS
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-green-600 hover:bg-green-700 active:scale-95'
                                        }`}
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    Thêm loại vé ({tickets.length}/{MAX_TICKETS})
                                </button>
                            </div>

                            {/* Ticket Items Grid - Dynamic Columns (no scrollbar) */}
                            <div className={`grid gap-4 transition-all duration-300 ${tickets.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                {tickets.map((ticket, index) => (
                                    <div 
                                        key={ticket.name} 
                                        className="p-3 border border-gray-200 dark:border-slate-800/85 rounded-lg relative bg-white dark:bg-slate-950/60 shadow-sm space-y-2 transition-all duration-300 hover:shadow-md animate-in fade-in-50 zoom-in-95 duration-200"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-350 uppercase tracking-wider mb-1">
                                                    Loại vé *
                                                </label>
                                                <select
                                                    value={ticket.name}
                                                    onChange={(e) => handleTicketTypeChange(index, e.target.value as TicketType)}
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
                                                    className="p-1.5 rounded-lg text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors active:scale-90"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            {/* description */}
                                            <div>
                                                <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-355 uppercase tracking-wider mb-1">
                                                    Mô tả *
                                                </label>
                                                <textarea
                                                    value={ticket.description}
                                                    onChange={(e) => handleTicketChange(index, 'description', e.target.value)}
                                                    required
                                                    rows={2}
                                                    className="w-full px-3 py-1 bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs resize-none"
                                                />
                                            </div>

                                            {/* price + maxQuantity side-by-side */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-350 uppercase tracking-wider mb-1">
                                                        Giá (VNĐ) *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={ticket.price}
                                                        onChange={(e) => handleTicketChange(index, 'price', e.target.value)}
                                                        required
                                                        min="0"
                                                        max={MAX_PRICE_DIGITS}
                                                        className={`w-full px-2.5 py-1 bg-white dark:bg-slate-950 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs ${
                                                            ticket.price > MAX_TICKET_PRICE
                                                                ? 'border-red-500 bg-red-50/20'
                                                                : 'border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white'
                                                        }`}
                                                        placeholder="Tối đa 100M"
                                                    />
                                                    {ticket.price > MAX_TICKET_PRICE && (
                                                        <p className="text-red-500 text-[10px] font-bold mt-1">
                                                            ⚠️ Vượt 100 triệu
                                                        </p>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-355 uppercase tracking-wider mb-1">
                                                        Số lượng tối đa *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={ticket.maxQuantity}
                                                        onChange={(e) => handleTicketChange(index, 'maxQuantity', e.target.value)}
                                                        required
                                                        min="10"
                                                        step="10"
                                                        placeholder="10, 20, ..."
                                                        className="w-full px-2.5 py-1 bg-white dark:bg-slate-950 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
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
                            to="/dashboard/event-requests"
                            className="px-5 py-2 border border-gray-300 dark:border-slate-700 text-gray-750 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-xs font-bold shadow-sm"
                        >
                            Hủy
                        </Link>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`inline-flex items-center gap-1.5 px-5 py-2 text-white rounded-lg transition-colors text-xs font-bold shadow ${isSubmitting
                                ? 'bg-blue-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                                }`}
                        >
                            {isSubmitting && <Loader className="w-3.5 h-3.5 animate-spin" />}
                            {isSubmitting ? 'Đang xử lý...' : 'Cập nhật yêu cầu'}
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
                                    className="p-1 rounded-full hover:bg-slate-200/50 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
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
                                                    className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-white/10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDrawerAvatarFile(null)
                                                        setDrawerAvatarPreview(null)
                                                    }}
                                                    className="absolute -top-1 -right-1 p-0.5 bg-red-600 text-white rounded-full hover:bg-red-500 transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 border border-dashed border-slate-300 dark:border-white/10 flex items-center justify-center text-gray-400 dark:text-neutral-500">
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

