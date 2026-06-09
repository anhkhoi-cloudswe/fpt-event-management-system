// Import router hooks + Link
import { useParams, useNavigate, Link } from 'react-router-dom'
// useParams: lÃ¡ÂºÂ¥y param trÃƒÂªn URL (vd /dashboard/event-requests/:id/edit -> lÃ¡ÂºÂ¥y id)
// useNavigate: Ã„â€˜iÃ¡Â»Âu hÃ†Â°Ã¡Â»â€ºng trang bÃ¡ÂºÂ±ng code
// Link: chuyÃ¡Â»Æ’n trang SPA khÃƒÂ´ng reload

// Import icon Ã„â€˜Ã¡Â»Æ’ UI Ã„â€˜Ã¡ÂºÂ¹p hÃ†Â¡n
import { Upload, X, Plus, Trash2, Loader } from 'lucide-react'
// Upload: icon upload Ã¡ÂºÂ£nh
// X: icon Ã„â€˜ÃƒÂ³ng / xÃƒÂ³a Ã¡ÂºÂ£nh
// Plus: icon thÃƒÂªm vÃƒÂ©
// Trash2: icon xÃƒÂ³a loÃ¡ÂºÂ¡i vÃƒÂ©
// Loader: icon loading spinner

// React hooks
import { useState, useEffect, useRef } from 'react'
// useState: lÃ†Â°u state form (speaker, tickets, banner, loading...)
// useEffect: gÃ¡Â»Âi API load dÃ¡Â»Â¯ liÃ¡Â»â€¡u (expectedCapacity, event detail) khi mount
// useRef: lÃ†Â°u biÃ¡ÂºÂ¿n khÃƒÂ´ng gÃƒÂ¢y re-render (Ã¡Â»Å¸ Ã„â€˜ÃƒÂ¢y dÃƒÂ¹ng Ã„â€˜Ã¡Â»Æ’ chÃ¡ÂºÂ·n spam toast warning)

// Utils upload Ã¡ÂºÂ£nh
import { uploadEventBanner, validateImageFile } from '../utils/imageUpload'
// validateImageFile: validate file Ã¡ÂºÂ£nh (Ã„â€˜uÃƒÂ´i file/size/...)
// uploadEventBanner: upload Ã¡ÂºÂ£nh lÃƒÂªn server/storage vÃƒÂ  trÃ¡ÂºÂ£ vÃ¡Â»Â URL

// Toast context Ã„â€˜Ã¡Â»Æ’ hiÃ¡Â»â€¡n thÃƒÂ´ng bÃƒÂ¡o dÃ¡ÂºÂ¡ng toast
import { useToast } from '../contexts/ToastContext'
// showToast(type, message): hiÃ¡Â»Æ’n thÃ¡Â»â€¹ toast success/error/warning

// ======================= TYPES =======================

// TicketType: chÃ¡Â»â€° cho phÃƒÂ©p 2 loÃ¡ÂºÂ¡i vÃƒÂ© (VIP hoÃ¡ÂºÂ·c STANDARD)
type TicketType = 'VIP' | 'STANDARD'

// Ticket: cÃ¡ÂºÂ¥u trÃƒÂºc dÃ¡Â»Â¯ liÃ¡Â»â€¡u 1 loÃ¡ÂºÂ¡i vÃƒÂ© trong form edit
type Ticket = {
    name: TicketType          // VIP / STANDARD
    description: string       // mÃƒÂ´ tÃ¡ÂºÂ£ loÃ¡ÂºÂ¡i vÃƒÂ©
    price: number             // giÃƒÂ¡ vÃƒÂ©
    maxQuantity: number       // sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng tÃ¡Â»â€˜i Ã„â€˜a (giÃ¡Â»â€ºi hÃ¡ÂºÂ¡n bÃƒÂ¡n)
    status: 'ACTIVE'          // trÃ¡ÂºÂ¡ng thÃƒÂ¡i vÃƒÂ© (Ã¡Â»Å¸ Ã„â€˜ÃƒÂ¢y hardcode ACTIVE)
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
    createdEventId?: number // Ã¢Å“â€¦ NEW: For APPROVED requests with created event
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

    // LÃ¡ÂºÂ¥y id (requestId) tÃ¡Â»Â« URL param
    const { id } = useParams<{ id: string }>()

    // navigate: chuyÃ¡Â»Æ’n trang bÃ¡ÂºÂ±ng code
    const navigate = useNavigate()

    // showToast: hiÃ¡Â»Æ’n thÃ¡Â»â€¹ toast message
    const { showToast } = useToast()

    // ======================= STATE CHUNG =======================

    // loading: Ã„â€˜ang load dÃ¡Â»Â¯ liÃ¡Â»â€¡u (fetch event request + event details)
    const [loading, setLoading] = useState(false)

    // isSubmitting: trÃ¡ÂºÂ¡ng thÃƒÂ¡i Ã„â€˜ang submit form update (disable nÃƒÂºt)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // error: lÃ¡Â»â€”i tÃ¡Â»â€¢ng (validate hoÃ¡ÂºÂ·c API fail)
    const [error, setError] = useState<string | null>(null)

    // Ã¢Å“â€¦ NEW: datetimeValidationError - kiÃ¡Â»Æ’m tra datetime fields cÃƒÂ³ trÃ¡Â»â€˜ng khÃƒÂ´ng
    const [datetimeValidationError, setDatetimeValidationError] = useState<string | null>(null)

    // expectedCapacity: sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng dÃ¡Â»Â± kiÃ¡ÂºÂ¿n tÃ¡Â»Â« "event request" (Ã„â€˜Ã¡Â»Æ’ giÃ¡Â»â€ºi hÃ¡ÂºÂ¡n tÃ¡Â»â€¢ng sÃ¡Â»â€˜ vÃƒÂ©)
    const [expectedCapacity, setExpectedCapacity] = useState<number>(0)

    // eligibilityError: lÃ¡Â»â€”i tÃ¡Â»Â« kiÃ¡Â»Æ’m tra tÃƒÂ­nh khÃ¡ÂºÂ£ thi cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t
    const [eligibilityError, setEligibilityError] = useState<string | null>(null)

    // ======================= FORM STATE =======================

    // eventRequest: dÃ¡Â»Â¯ liÃ¡Â»â€¡u request (title, description, dates, capacity...)
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

    // speaker: thÃƒÂ´ng tin diÃ¡Â»â€¦n giÃ¡ÂºÂ£ nhÃ¡ÂºÂ­p trÃƒÂªn form
    const [speaker, setSpeaker] = useState<Speaker>({
        fullName: '',
        bio: '',
        email: '',
        phone: '',
        avatarUrl: '',
    })

    // ======================= TICKET STATE =======================

    // tickets: danh sÃƒÂ¡ch loÃ¡ÂºÂ¡i vÃƒÂ©
    // Default tÃ¡ÂºÂ¡o sÃ¡ÂºÂµn 2 loÃ¡ÂºÂ¡i VIP + STANDARD Ã„â€˜Ã¡Â»Æ’ user nhÃ¡ÂºÂ­p nhanh
    const [tickets, setTickets] = useState<Ticket[]>([
        { name: 'VIP', description: '', price: 0, maxQuantity: 0, status: 'ACTIVE' },
        { name: 'STANDARD', description: '', price: 0, maxQuantity: 0, status: 'ACTIVE' },
    ])

    // ======================= BANNER IMAGE STATE =======================

    // bannerUrl: URL banner hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i (tÃ¡Â»Â« API hoÃ¡ÂºÂ·c sau khi upload)
    const [bannerUrl, setBannerUrl] = useState('')

    // selectedImage: file banner user vÃ¡Â»Â«a chÃ¡Â»Ân (Ã„â€˜Ã¡Â»Æ’ upload)
    const [selectedImage, setSelectedImage] = useState<File | null>(null)

    // imagePreview: preview base64 hoÃ¡ÂºÂ·c url Ã„â€˜Ã¡Â»Æ’ hiÃ¡Â»Æ’n thÃ¡Â»â€¹ Ã¡ÂºÂ£nh trÃ†Â°Ã¡Â»â€ºc khi submit
    const [imagePreview, setImagePreview] = useState<string | null>(null)

    // isDragging: UI trÃ¡ÂºÂ¡ng thÃƒÂ¡i drag-drop banner
    const [isDragging, setIsDragging] = useState(false)

    // ======================= AVATAR IMAGE STATE =======================

    // selectedAvatarImage: file avatar diÃ¡Â»â€¦n giÃ¡ÂºÂ£ user chÃ¡Â»Ân
    const [selectedAvatarImage, setSelectedAvatarImage] = useState<File | null>(null)

    // avatarPreview: preview Ã¡ÂºÂ£nh avatar
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

    // isDraggingAvatar: UI trÃ¡ÂºÂ¡ng thÃƒÂ¡i drag-drop avatar
    const [isDraggingAvatar, setIsDraggingAvatar] = useState(false)

    // ======================= CONSTANTS =======================

    // MAX_TICKET_PRICE: Maximum allowed ticket price (100 million VNÃ„Â)
    const MAX_TICKET_PRICE = 100000000
    const MAX_PRICE_DIGITS = 999999999 // Max value for input display (9 digits)

    // ======================= REF CHÃ¡ÂºÂ¶N SPAM TOAST =======================

    // hasShownWarningRef: dÃƒÂ¹ng Ã„â€˜Ã¡Â»Æ’ chÃ¡ÂºÂ·n viÃ¡Â»â€¡c toast warning bÃ¡Â»â€¹ spam liÃƒÂªn tÃ¡Â»Â¥c khi user nhÃ¡ÂºÂ­p maxQuantity
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
     * Ã¢Å“â€¦ UPDATED: SÃ¡Â»Â­ dÃ¡Â»Â¥ng endpoint riÃƒÂªng GET /api/event-requests/{id} Ã„â€˜Ã¡Â»Æ’ lÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u chi tiÃ¡ÂºÂ¿t
     * - Endpoint nÃƒÂ y JOIN vÃ¡Â»â€ºi Event, VenueArea, Venue Ã„â€˜Ã¡Â»Æ’ lÃ¡ÂºÂ¥y Ã„â€˜Ã¡ÂºÂ§y Ã„â€˜Ã¡Â»Â§ thÃƒÂ´ng tin datetime
     * - TrÃƒÂ¡nh lÃ¡Â»â€”i datetime rÃ¡Â»â€”ng khi dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»Â« list endpoint khÃƒÂ´ng Ã„â€˜Ã¡ÂºÂ§y Ã„â€˜Ã¡Â»Â§
     */
    const fetchEventRequestData = async () => {
        try {


            // Ã¢Å“â€¦ NEW: GÃ¡Â»Âi API chi tiÃ¡ÂºÂ¿t request (thay vÃƒÂ¬ dÃƒÂ¹ng list vÃƒÂ  tÃƒÂ¬m)
            // Endpoint nÃƒÂ y trÃ¡ÂºÂ£ vÃ¡Â»Â dÃ¡Â»Â¯ liÃ¡Â»â€¡u Ã„â€˜Ã¡ÂºÂ§y Ã„â€˜Ã¡Â»Â§ vÃ¡Â»â€ºi datetime fields Ã„â€˜Ã†Â°Ã¡Â»Â£c JOIN tÃ¡Â»Â« Event
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

            // Pre-fill form data tÃ¡Â»Â« request chi tiÃ¡ÂºÂ¿t
            // Ã¢Å“â€¦ Ã„ÂÃ¡ÂºÂ£m bÃ¡ÂºÂ£o preferredStartTime + preferredEndTime khÃƒÂ´ng rÃ¡Â»â€”ng
            setEventRequest({
                requestId: detailedRequest.requestId,
                createdEventId: detailedRequest.createdEventId, // Ã¢Å“â€¦ NEW: Capture for backend update
                title: detailedRequest.title || '',
                description: detailedRequest.description || '',
                preferredStartTime: detailedRequest.preferredStartTime || '',
                preferredEndTime: detailedRequest.preferredEndTime || '',
                expectedCapacity: detailedRequest.expectedCapacity || 0,
                status: detailedRequest.status || 'APPROVED',
            })

            // Ã¢Å“â€¦ NEW: Validate datetime fields
            if (!detailedRequest.preferredStartTime || !detailedRequest.preferredEndTime) {
                setDatetimeValidationError('ThÃƒÂ´ng tin thÃ¡Â»Âi gian khÃƒÂ´ng Ã„â€˜Ã¡ÂºÂ§y Ã„â€˜Ã¡Â»Â§. Vui lÃƒÂ²ng liÃƒÂªn hÃ¡Â»â€¡ bÃ¡Â»â„¢ phÃ¡ÂºÂ­n hÃ¡Â»â€” trÃ¡Â»Â£.')
            }

            const matchingRequest = detailedRequest

            // LÃ†Â°u expectedCapacity cho validation
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
            // KiÃ¡Â»Æ’m tra xem sÃ¡Â»Â± kiÃ¡Â»â€¡n cÃƒÂ³ thÃ¡Â»Æ’ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t Ã„â€˜Ã†Â°Ã¡Â»Â£c khÃƒÂ´ng
            if (matchingRequest.createdEventId) {
                try {
                    // KiÃ¡Â»Æ’m tra tÃƒÂ­nh khÃ¡ÂºÂ£ thi: status vÃƒÂ  thÃ¡Â»Âi gian
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
                            setEligibilityError('SÃ¡Â»Â± kiÃ¡Â»â€¡n Ã„â€˜ÃƒÂ£ kÃ¡ÂºÂ¿t thÃƒÂºc hoÃ¡ÂºÂ·c bÃ¡Â»â€¹ hÃ¡Â»Â§y, khÃƒÂ´ng thÃ¡Â»Æ’ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t')
                            setLoading(false)
                            return
                        }

                        // Check 2: 24-hour rule
                        if (eventData.startTime) {
                            const startTime = new Date(eventData.startTime)
                            const now = new Date()
                            const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)

                            if (hoursUntilStart < 24) {
                                setEligibilityError('ChÃ¡Â»â€° Ã„â€˜Ã†Â°Ã¡Â»Â£c phÃƒÂ©p cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t thÃƒÂ´ng tin sÃ¡Â»Â± kiÃ¡Â»â€¡n trÃ†Â°Ã¡Â»â€ºc khi bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u ÃƒÂ­t nhÃ¡ÂºÂ¥t 24 tiÃ¡ÂºÂ¿ng')
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

            // BÃ†Â°Ã¡Â»â€ºc 2 (tiÃ¡ÂºÂ¿p tÃ¡Â»Â¥c): NÃ¡ÂºÂ¿u request cÃƒÂ³ createdEventId, gÃ¡Â»Âi API chi tiÃ¡ÂºÂ¿t event Ã„â€˜Ã¡Â»Æ’ pre-fill data
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

                        // Ã¢Å“â€¦ FIX: Map Ã„â€˜ÃƒÂºng tÃƒÂªn field tÃ¡Â»Â« Backend JSON
                        // Backend trÃ¡ÂºÂ£ vÃ¡Â»Â: speakerName, speakerBio, speakerEmail, speakerPhone, speakerAvatarUrl
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

                        // Pre-fill tickets nÃ¡ÂºÂ¿u cÃƒÂ³
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
                    // KhÃƒÂ´ng fail whole page, chÃ¡Â»â€° warn user
                    showToast('warning', 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i chi tiÃ¡ÂºÂ¿t sÃ¡Â»Â± kiÃ¡Â»â€¡n. Vui lÃƒÂ²ng Ã„â€˜iÃ¡Â»Ân thÃƒÂ´ng tin thÃ¡Â»Â§ cÃƒÂ´ng.')
                }
            }
        } catch (error) {
            console.error('Error fetching event request:', error)
            setError(error instanceof Error ? error.message : 'Ã„ÂÃƒÂ£ xÃ¡ÂºÂ£y ra lÃ¡Â»â€”i khi tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u')
        } finally {
            setLoading(false)
        }
    }

    // ======================= HANDLERS: EVENT REQUEST =======================

    // handleRequestChange: cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t field cÃ¡Â»Â§a event request
    const handleRequestChange = (field: keyof EventRequest, value: string | number) => {
        setEventRequest((prev) => ({ ...prev, [field]: value }))
        // Ã¢Å“â€¦ NEW: Reset datetime validation error khi user thay Ã„â€˜Ã¡Â»â€¢i field
        if (field === 'preferredStartTime' || field === 'preferredEndTime') {
            setDatetimeValidationError(null)
        }
    }

    // ======================= HANDLERS: SPEAKER =======================

    // handleSpeakerChange: cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t tÃ¡Â»Â«ng field cÃ¡Â»Â§a speaker
    const handleSpeakerChange = (field: keyof Speaker, value: string) => {
        setSpeaker((prev) => ({ ...prev, [field]: value }))
    }

    // ======================= HANDLERS: TICKET =======================

    // handleTicketChange: cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t field cÃ¡Â»Â§a 1 ticket theo index
    const handleTicketChange = (
        index: number,
        field: keyof Ticket,
        value: string | number,
    ) => {
        setTickets((prev) => {
            const updated = [...prev]

            // NÃ¡ÂºÂ¿u field lÃƒÂ  price/maxQuantity -> convert sang number
            const convertedValue =
                field === 'price' || field === 'maxQuantity'
                    ? value === ''
                        ? 0
                        : Number(value)
                    : value

            // Ã¢Å“â€¦ NEW: Validate ticket price
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
                        `Ã¢Å¡Â Ã¯Â¸Â GiÃƒÂ¡ vÃƒÂ© khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c vÃ†Â°Ã¡Â»Â£t quÃƒÂ¡ ${MAX_TICKET_PRICE.toLocaleString('vi-VN')} VNÃ„Â (100 triÃ¡Â»â€¡u)`
                    )
                }

                updated[index] = { ...updated[index], price: numValue }
            } else {
                // cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t ticket tÃ¡ÂºÂ¡i index
                updated[index] = { ...updated[index], [field]: convertedValue }
            }

            // Validate capacity khi Ã„â€˜Ã¡Â»â€¢i maxQuantity
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
                            `TÃ¡Â»â€¢ng sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng tÃ¡Â»â€˜i Ã„â€˜a cÃ¡Â»Â§a tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ vÃƒÂ© (${totalMaxQuantity}) khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c vÃ†Â°Ã¡Â»Â£t quÃƒÂ¡ ${expectedCapacity} (sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng dÃ¡Â»Â± kiÃ¡ÂºÂ¿n tÃ¡Â»Â« yÃƒÂªu cÃ¡ÂºÂ§u)`,
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

    // handleAddTicket: thÃƒÂªm 1 loÃ¡ÂºÂ¡i vÃƒÂ© mÃ¡Â»â€ºi
    const handleAddTicket = () => {
        if (tickets.length >= MAX_TICKETS) {
            showToast('warning', `TÃ¡Â»â€˜i Ã„â€˜a chÃ¡Â»â€° Ã„â€˜Ã†Â°Ã¡Â»Â£c thÃƒÂªm ${MAX_TICKETS} loÃ¡ÂºÂ¡i vÃƒÂ©`)
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

    // handleRemoveTicket: xÃƒÂ³a loÃ¡ÂºÂ¡i vÃƒÂ© theo index
    const handleRemoveTicket = (index: number) => {
        if (tickets.length <= 1) {
            setError('PhÃ¡ÂºÂ£i cÃƒÂ³ ÃƒÂ­t nhÃ¡ÂºÂ¥t 1 loÃ¡ÂºÂ¡i vÃƒÂ©')
            return
        }
        setTickets((prev) => prev.filter((_, i) => i !== index))
    }

    // handleTicketTypeChange: Ã„â€˜Ã¡Â»â€¢i name VIP/STANDARD cho ticket
    const handleTicketTypeChange = (index: number, newType: TicketType) => {
        setTickets((prev) => {
            const isDuplicate = prev.some((ticket, i) => i !== index && ticket.name === newType)

            if (isDuplicate) {
                showToast('warning', `LoÃ¡ÂºÂ¡i vÃƒÂ© ${newType} Ã„â€˜ÃƒÂ£ tÃ¡Â»â€œn tÃ¡ÂºÂ¡i. Vui lÃƒÂ²ng chÃ¡Â»Ân loÃ¡ÂºÂ¡i vÃƒÂ© khÃƒÂ¡c.`)
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
     * Ã¢Å“â€¦ NEW: 3-Step Atomic Update Flow (Zero-Waste Upload)
     *
     * Step 1 (Check):
     *   - Validate form locally
     *   - Call API with dryRun: true
     *   - If error Ã¢â€ â€™ show error, STOP (no uploads)
     *   - If OK Ã¢â€ â€™ proceed to Step 2
     *
     * Step 2 (Upload):
     *   - Upload banner to AWS S3 via backend (if new)
     *   - Upload avatar to AWS S3 via backend (if new)
     *   - If any upload fails Ã¢â€ â€™ show warning, continue with old URLs
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

        // Ã¢Å“â€¦ NEW: Validate datetime fields trÃ†Â°Ã¡Â»â€ºc khi submit
        if (!eventRequest.preferredStartTime || !eventRequest.preferredEndTime) {
            setError('ThÃ¡Â»Âi gian bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u vÃƒÂ  kÃ¡ÂºÂ¿t thÃƒÂºc khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã„â€˜Ã¡Â»Æ’ trÃ¡Â»â€˜ng')
            setDatetimeValidationError('Vui lÃƒÂ²ng chÃ¡ÂºÂ¯c chÃ¡ÂºÂ¯n rÃ¡ÂºÂ±ng dÃ¡Â»Â¯ liÃ¡Â»â€¡u thÃ¡Â»Âi gian Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c tÃ¡ÂºÂ£i Ã„â€˜Ã¡ÂºÂ§y Ã„â€˜Ã¡Â»Â§')
            setIsSubmitting(false)
            return
        }

        try {
            // ===== VALIDATE SPEAKER INFO =====
            if (!speaker.fullName || speaker.fullName.trim() === '') {
                setError('Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p hÃ¡Â»Â tÃƒÂªn diÃ¡Â»â€¦n giÃ¡ÂºÂ£')
                setIsSubmitting(false)
                return
            }

            if (!speaker.bio || speaker.bio.trim() === '') {
                setError('Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p tiÃ¡Â»Æ’u sÃ¡Â»Â­ diÃ¡Â»â€¦n giÃ¡ÂºÂ£')
                setIsSubmitting(false)
                return
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!speaker.email || !emailRegex.test(speaker.email)) {
                setError('Vuii lÃƒÂ²ng nhÃ¡ÂºÂ­p email hÃ¡Â»Â£p lÃ¡Â»â€¡ (vÃƒÂ­ dÃ¡Â»Â¥: nguoi@gmail.com)')
                setIsSubmitting(false)
                return
            }

            // Validate phone format (Vietnamese phone: 10 digits starting with 0, or +84)
            const phoneRegex = /^(\+84|0)?[1-9]\d{8,9}$/
            if (!speaker.phone || !phoneRegex.test(speaker.phone.replace(/\s/g, ''))) {
                setError('Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p sÃ¡Â»â€˜ Ã„â€˜iÃ¡Â»â€¡n thoÃ¡ÂºÂ¡i hÃ¡Â»Â£p lÃ¡Â»â€¡ (vÃƒÂ­ dÃ¡Â»Â¥: 0912345678)')
                setIsSubmitting(false)
                return
            }

            // Validate: tÃ¡Â»â€¢ng sÃ¡Â»â€˜ vÃƒÂ© khÃƒÂ´ng vÃ†Â°Ã¡Â»Â£t expectedCapacity
            if (expectedCapacity > 0) {
                const totalMaxQuantity = tickets.reduce((sum, ticket) => sum + ticket.maxQuantity, 0)
                if (totalMaxQuantity > expectedCapacity) {
                    setError(
                        `TÃ¡Â»â€¢ng sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng tÃ¡Â»â€˜i Ã„â€˜a cÃ¡Â»Â§a tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ vÃƒÂ© (${totalMaxQuantity}) khÃƒÂ´ng Ã„â€˜Ã†Â°Ã¡Â»Â£c vÃ†Â°Ã¡Â»Â£t quÃƒÂ¡ sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng dÃ¡Â»Â± kiÃ¡ÂºÂ¿n (${expectedCapacity})`,
                    )
                    setIsSubmitting(false)
                    return
                }
            }


            // ===== STEP 1: DRY RUN - Validate without committing =====
            console.log('[STEP 1] Validating form data...')
            showToast('info', 'Ã„Âang kiÃ¡Â»Æ’m tra thÃƒÂ´ng tin...')

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
                dryRun: true, // Ã¢Å“â€¦ NEW: Dry run mode
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
                // Ã¢ÂÅ’ Dry run failed - validation error, NO uploads happen
                const errorText = await dryRunResponse.text()
                console.error('[STEP 1] DRY RUN FAILED:', errorText)
                setError(errorText || 'LÃ¡Â»â€”i kiÃ¡Â»Æ’m tra thÃƒÂ´ng tin: dÃ¡Â»Â¯ liÃ¡Â»â€¡u khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡')
                showToast('error', `KiÃ¡Â»Æ’m tra thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i: ${errorText || 'dÃ¡Â»Â¯ liÃ¡Â»â€¡u khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡'}`)
                setIsSubmitting(false)
                return
            }

            console.log('[STEP 1] Ã¢Å“â€¦ Dry run passed, proceeding to upload images')
            showToast('success', 'KiÃ¡Â»Æ’m tra thÃƒÂ´ng tin thÃƒÂ nh cÃƒÂ´ng')

            // ===== STEP 2: UPLOAD IMAGES =====
            console.log('[STEP 2] Uploading images to Supabase...')
            let finalBannerUrl = bannerUrl
            let finalAvatarUrl = speaker.avatarUrl

            if (selectedImage) {
                try {
                    console.log('[STEP 2] Uploading banner...')
                    finalBannerUrl = await uploadEventBanner(selectedImage)
                    console.log('[STEP 2] Ã¢Å“â€¦ Banner uploaded:', finalBannerUrl)
                } catch (uploadError: any) {
                    console.error('[STEP 2] Banner upload failed:', uploadError)
                    showToast('warning', 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i Ã¡ÂºÂ£nh banner lÃƒÂªn, sÃ¡ÂºÂ½ giÃ¡Â»Â¯ Ã¡ÂºÂ£nh cÃ…Â©')
                    finalBannerUrl = bannerUrl
                }
            }

            if (selectedAvatarImage) {
                try {
                    console.log('[STEP 2] Uploading avatar...')
                    finalAvatarUrl = await uploadEventBanner(selectedAvatarImage)
                    console.log('[STEP 2] Ã¢Å“â€¦ Avatar uploaded:', finalAvatarUrl)
                } catch (uploadError: any) {
                    console.error('[STEP 2] Avatar upload failed:', uploadError)
                    showToast('warning', 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i Ã¡ÂºÂ£nh avatar lÃƒÂªn, sÃ¡ÂºÂ½ giÃ¡Â»Â¯ Ã¡ÂºÂ£nh cÃ…Â©')
                    finalAvatarUrl = speaker.avatarUrl
                }
            }

            // ===== STEP 3: COMMIT - Final API call with images =====
            console.log('[STEP 3] Committing changes to database...')
            showToast('info', 'Ã„Âang lÃ†Â°u thay Ã„â€˜Ã¡Â»â€¢i...')

            const commitRequest: any = {
                requestId: eventRequest.requestId,
                speaker: {
                    fullName: speaker.fullName,
                    bio: speaker.bio,
                    email: speaker.email,
                    phone: speaker.phone,
                    avatarUrl: finalAvatarUrl, // Ã¢Å“â€¦ Use uploaded URL or old URL
                },
                tickets: tickets.map((ticket) => ({
                    name: ticket.name,
                    description: ticket.description,
                    price: Number(ticket.price),
                    maxQuantity: Number(ticket.maxQuantity),
                    status: 'ACTIVE',
                })),
                bannerUrl: finalBannerUrl, // Ã¢Å“â€¦ Use uploaded URL or old URL
                status: 'UPDATING',
                dryRun: false, // Ã¢Å“â€¦ Commit to database
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
                console.log('[STEP 3] Ã¢Å“â€¦ Commit successful')
                showToast('success', 'CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t yÃƒÂªu cÃ¡ÂºÂ§u thÃƒÂ nh cÃƒÂ´ng! TrÃ¡ÂºÂ¡ng thÃƒÂ¡i chuyÃ¡Â»Æ’n sang UPDATING.')
                await new Promise(resolve => setTimeout(resolve, 500))
                navigate('/dashboard/event-requests')
            } else {
                console.error('[STEP 3] Commit failed:', commitText)
                setError(commitText || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u thay Ã„â€˜Ã¡Â»â€¢i')
                showToast('error', commitText || 'LÃ¡Â»â€”i khi lÃ†Â°u thay Ã„â€˜Ã¡Â»â€¢i')
                throw new Error(commitText || 'Failed to commit changes')
            }
        } catch (error) {
            console.error('Error in update flow:', error)
            setError(error instanceof Error ? error.message : 'KhÃƒÂ´ng thÃ¡Â»Æ’ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t yÃƒÂªu cÃ¡ÂºÂ§u')
            showToast('error', error instanceof Error ? error.message : 'LÃ¡Â»â€”i khÃƒÂ´ng xÃƒÂ¡c Ã„â€˜Ã¡Â»â€¹nh')
        } finally {
            setIsSubmitting(false)
        }
    }

    // ======================= RENDER =======================

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <p className="text-gray-500 dark:text-slate-400">Ã„Âang tÃ¡ÂºÂ£i...</p>
            </div>
        )
    }

    // If eligibility check failed, show error and prevent form submission
    if (eligibilityError) {
        return (
            <div className="flex justify-center">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md p-8 max-w-4xl w-full text-slate-900 dark:text-slate-100">
                    <div className="flex justify-center mb-6">
                        <div className="text-6xl">Ã°Å¸Å¡Â«</div>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-6 text-center">
                        KhÃƒÂ´ng thÃ¡Â»Æ’ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t yÃƒÂªu cÃ¡ÂºÂ§u
                    </h1>

                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 rounded-lg p-6 mb-8">
                        <p className="text-red-800 dark:text-red-300 text-center font-medium text-lg">
                            {eligibilityError}
                        </p>
                    </div>

                    <p className="text-gray-600 dark:text-slate-300 text-center mb-8">
                        Theo quy Ã„â€˜Ã¡Â»â€¹nh nghiÃ¡Â»â€¡p vÃ¡Â»Â¥, sÃ¡Â»Â± kiÃ¡Â»â€¡n khÃƒÂ´ng Ã„â€˜ÃƒÂ¡p Ã¡Â»Â©ng cÃƒÂ¡c Ã„â€˜iÃ¡Â»Âu kiÃ¡Â»â€¡n cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t.
                    </p>

                    <div className="flex justify-center">
                        <Link
                            to="/dashboard/event-requests"
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            Ã¢â€ Â Quay lÃ¡ÂºÂ¡i danh sÃƒÂ¡ch yÃƒÂªu cÃ¡ÂºÂ§u
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex justify-center">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-md p-8 max-w-4xl w-full text-slate-900 dark:text-slate-100">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50 mb-6 text-center">
                    CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t yÃƒÂªu cÃ¡ÂºÂ§u tÃ¡Â»â€¢ chÃ¡Â»Â©c sÃ¡Â»Â± kiÃ¡Â»â€¡n
                </h1>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* ================= SPEAKER INFO ================= */}
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-4">ThÃƒÂ´ng tin diÃ¡Â»â€¦n giÃ¡ÂºÂ£</h2>

                        <div className="space-y-4">
                            {/* fullName */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                    HÃ¡Â»Â vÃƒÂ  tÃƒÂªn *
                                </label>
                                <input
                                    type="text"
                                    value={speaker.fullName}
                                    onChange={(e) => handleSpeakerChange('fullName', e.target.value)}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            {/* bio */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                    TiÃ¡Â»Æ’u sÃ¡Â»Â­ *
                                </label>
                                <textarea
                                    value={speaker.bio}
                                    onChange={(e) => handleSpeakerChange('bio', e.target.value)}
                                    required
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            {/* email + phone */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                        Email *
                                    </label>
                                    <input
                                        type="email"
                                        value={speaker.email}
                                        onChange={(e) => handleSpeakerChange('email', e.target.value)}
                                        required
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                        SÃ¡Â»â€˜ Ã„â€˜iÃ¡Â»â€¡n thoÃ¡ÂºÂ¡i *
                                    </label>
                                    <input
                                        type="tel"
                                        value={speaker.phone}
                                        onChange={(e) => handleSpeakerChange('phone', e.target.value)}
                                        required
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            {/* avatar upload */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                    Ã¡ÂºÂ¢nh Ã„â€˜Ã¡ÂºÂ¡i diÃ¡Â»â€¡n diÃ¡Â»â€¦n giÃ¡ÂºÂ£ (tÃƒÂ¹y chÃ¡Â»Ân)
                                </label>

                                {!avatarPreview ? (
                                    <div
                                        onDragOver={handleAvatarDragOver}
                                        onDragLeave={handleAvatarDragLeave}
                                        onDrop={handleAvatarDrop}
                                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDraggingAvatar ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 hover:border-blue-400'
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
                                            <Upload className="w-10 h-10 mx-auto text-gray-400 dark:text-slate-500 mb-3" />
                                            <p className="text-gray-600 dark:text-slate-300 mb-1 text-sm">KÃƒÂ©o thÃ¡ÂºÂ£ Ã¡ÂºÂ£nh hoÃ¡ÂºÂ·c click Ã„â€˜Ã¡Â»Æ’ chÃ¡Â»Ân</p>
                                            <p className="text-xs text-gray-500 dark:text-slate-400">PNG, JPG, GIF tÃ¡Â»â€˜i Ã„â€˜a 5MB</p>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <img
                                            src={avatarPreview}
                                            alt="Avatar Preview"
                                            className="w-32 h-32 object-cover rounded-full mx-auto border-4 border-gray-200 dark:border-slate-700"
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
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">ThÃƒÂ´ng tin vÃƒÂ©</h2>

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
                                ThÃƒÂªm loÃ¡ÂºÂ¡i vÃƒÂ© ({tickets.length}/{MAX_TICKETS})
                            </button>
                        </div>

                        {tickets.map((ticket, index) => (
                            <div key={index} className="mb-6 p-4 border border-gray-200 dark:border-slate-800 rounded-lg relative bg-white dark:bg-slate-900/60">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                            LoÃ¡ÂºÂ¡i vÃƒÂ© *
                                        </label>
                                        <select
                                            value={ticket.name}
                                            onChange={(e) => handleTicketTypeChange(index, e.target.value as TicketType)}
                                            className="w-48 px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="VIP">VIP</option>
                                            <option value="STANDARD">STANDARD</option>
                                        </select>
                                    </div>

                                    {tickets.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTicket(index)}
                                            className="p-2 rounded-lg text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    {/* description */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                            MÃƒÂ´ tÃ¡ÂºÂ£ *
                                        </label>
                                        <textarea
                                            value={ticket.description}
                                            onChange={(e) => handleTicketChange(index, 'description', e.target.value)}
                                            required
                                            rows={2}
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>

                                    {/* price + maxQuantity */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                                GiÃƒÂ¡ (VNÃ„Â) *
                                            </label>
                                            <input
                                                type="number"
                                                value={ticket.price}
                                                onChange={(e) => handleTicketChange(index, 'price', e.target.value)}
                                                required
                                                min="0"
                                                max={MAX_PRICE_DIGITS}
                                                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                                    ticket.price > MAX_TICKET_PRICE
                                                        ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                                                        : 'border-gray-300 dark:border-slate-700'
                                                }`}
                                                placeholder="TÃ¡Â»â€˜i Ã„â€˜a 100,000,000 VNÃ„Â"
                                            />
                                            {ticket.price > MAX_TICKET_PRICE && (
                                                <p className="text-red-600 dark:text-red-300 text-sm font-medium mt-1">
                                                    Ã¢Å¡Â Ã¯Â¸Â GiÃƒÂ¡ vÃƒÂ© vÃ†Â°Ã¡Â»Â£t quÃƒÂ¡ hÃ¡ÂºÂ¡n mÃ¡Â»Â©c cho phÃƒÂ©p (100 triÃ¡Â»â€¡u VNÃ„Â)
                                                </p>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                                                SÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng tÃ¡Â»â€˜i Ã„â€˜a *
                                            </label>
                                            <input
                                                type="number"
                                                value={ticket.maxQuantity}
                                                onChange={(e) => handleTicketChange(index, 'maxQuantity', e.target.value)}
                                                required
                                                min="10"
                                                step="10"
                                                placeholder="10, 20, 30, ..."
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ================= BANNER UPLOAD ================= */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                            Banner sÃ¡Â»Â± kiÃ¡Â»â€¡n *
                        </label>

                        {!imagePreview ? (
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 hover:border-blue-400'
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
                                    <Upload className="w-12 h-12 mx-auto text-gray-400 dark:text-slate-500 mb-4" />
                                    <p className="text-gray-600 dark:text-slate-300 mb-2">KÃƒÂ©o thÃ¡ÂºÂ£ Ã¡ÂºÂ£nh hoÃ¡ÂºÂ·c click Ã„â€˜Ã¡Â»Æ’ chÃ¡Â»Ân</p>
                                    <p className="text-sm text-gray-500 dark:text-slate-400">PNG, JPG, GIF tÃ¡Â»â€˜i Ã„â€˜a 5MB</p>
                                </label>
                            </div>
                        ) : (
                            <div className="relative">
                                <img src={imagePreview} alt="Preview" className="w-full h-64 object-cover rounded-lg border border-slate-200 dark:border-slate-800" />
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
                        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 rounded-lg">
                            <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
                        </div>
                    )}

                    {/* ================= BUTTONS ================= */}
                    <div className="flex justify-end gap-4 pt-4">
                        <Link
                            to="/dashboard/event-requests"
                            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            HÃ¡Â»Â§y
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
                            {isSubmitting ? 'Ã„Âang xÃ¡Â»Â­ lÃƒÂ½...' : 'CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t yÃƒÂªu cÃ¡ÂºÂ§u'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
