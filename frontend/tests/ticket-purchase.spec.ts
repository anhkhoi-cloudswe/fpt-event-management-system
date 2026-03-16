import { test, expect, type Page } from '@playwright/test'

type EventItem = {
  eventId: number
  status?: string
  startTime?: string
  endTime?: string
}

const MOCK_EVENT_ID = Number(process.env.E2E_MOCK_EVENT_ID ?? 999999)

async function enableMockPurchasableEvent(page: Page, eventId: number) {
  const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const futureEnd = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()

  await page.route('**/api/events/detail**', async (route) => {
    const url = new URL(route.request().url())
    const reqId = Number(url.searchParams.get('id') ?? 0)
    if (reqId !== eventId) {
      await route.fallback()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eventId,
        title: 'Playwright Mock Event',
        description: 'Mocked event for UI ticket purchase fallback flow',
        startTime: futureStart,
        endTime: futureEnd,
        maxSeats: 50,
        status: 'OPEN',
        areaId: 100,
        areaName: 'Mock Area',
        floor: '1',
        venueName: 'Mock Venue',
        venueLocation: 'Mock Location',
        tickets: [
          {
            categoryTicketId: 501,
            name: 'STANDARD',
            description: 'Mock Standard Ticket',
            price: 10000,
            maxQuantity: 50,
            remaining: 50,
            status: 'ACTIVE',
          },
        ],
      }),
    })
  })

  await page.route('**/api/seats**', async (route) => {
    const url = new URL(route.request().url())
    const areaId = Number(url.searchParams.get('areaId') ?? 0)
    const reqEventId = Number(url.searchParams.get('eventId') ?? 0)
    const seatType = (url.searchParams.get('seatType') ?? '').toUpperCase()

    if (areaId !== 100 || reqEventId !== eventId) {
      await route.fallback()
      return
    }

    if (seatType === 'VIP') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ seats: [], total: 0 }),
      })
      return
    }

    if (seatType === 'STANDARD') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          seats: [
            {
              seatId: 9001,
              seatCode: 'A1',
              seatRow: 'A',
              seatColumn: 1,
              rowNo: 'A',
              colNo: '1',
              status: 'AVAILABLE',
              seatType: 'STANDARD',
              categoryTicketId: 501,
              categoryName: 'STANDARD',
              areaId: 100,
            },
          ],
          total: 1,
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        seats: [
          {
            seatId: 9001,
            seatCode: 'A1',
            seatRow: 'A',
            seatColumn: 1,
            rowNo: 'A',
            colNo: '1',
            status: 'AVAILABLE',
            seatType: 'STANDARD',
            categoryTicketId: 501,
            categoryName: 'STANDARD',
            areaId: 100,
          },
        ],
        total: 1,
      }),
    })
  })

  await page.route(`**/api/events/${eventId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eventId,
        startTime: futureStart,
        endTime: futureEnd,
        status: 'OPEN',
      }),
    })
  })
}

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'ahkhoinguyen169@gmail.com'
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'pass111'

async function loginAsStudent(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()

  await page.getByLabel('Email').fill(STUDENT_EMAIL)
  await page.getByLabel('Mật khẩu').fill(STUDENT_PASSWORD)

  await Promise.all([
    page.waitForURL(/\/dashboard(?:$|\?)/),
    page.getByRole('button', { name: 'Đăng nhập' }).click(),
  ])
}

function pickPurchasableEventId(rawData: unknown): number | null {
  const now = new Date()

  const toEventArray = (data: any): EventItem[] => {
    if (Array.isArray(data)) return data
    const openEvents = Array.isArray(data?.openEvents) ? data.openEvents : []
    const closedEvents = Array.isArray(data?.closedEvents) ? data.closedEvents : []
    return [...openEvents, ...closedEvents]
  }

  const events = toEventArray(rawData)
  const openEvents = events.filter((e) => e?.status === 'OPEN' && typeof e?.eventId === 'number')

  const upcomingOpen = openEvents.find((e) => {
    if (!e.startTime) return false
    const start = new Date(e.startTime)
    return !Number.isNaN(start.getTime()) && start > now
  })
  if (upcomingOpen) return upcomingOpen.eventId

  const notEndedOpen = openEvents.find((e) => {
    if (!e.endTime) return true
    const end = new Date(e.endTime)
    return Number.isNaN(end.getTime()) || end > now
  })
  return notEndedOpen?.eventId ?? null
}

test.describe('UI E2E - Ticket Purchase Flow', () => {
  test('student can select seat and complete VNPay redirect to success page', async ({ page, baseURL }) => {
    const eventsResponsePromise = page.waitForResponse((res) => {
      return res.request().method() === 'GET' && res.url().includes('/api/events') && res.status() === 200
    })

    await loginAsStudent(page)

    const eventsResponse = await eventsResponsePromise
    const eventsPayload = await eventsResponse.json()
    let eventId = pickPurchasableEventId(eventsPayload)
    let usingMockFallback = false

    if (!eventId) {
      eventId = MOCK_EVENT_ID
      usingMockFallback = true
      await enableMockPurchasableEvent(page, eventId)
    }

    await page.goto(`/dashboard/events/${eventId}`)
    await expect(page.getByRole('heading', { name: 'Chọn ghế' })).toBeVisible()

    const availableSeat = page.locator('button[title*="AVAILABLE"]').first()
    const seatCount = await availableSeat.count()

    if (seatCount === 0) {
      eventId = MOCK_EVENT_ID
      usingMockFallback = true
      await enableMockPurchasableEvent(page, eventId)
      await page.goto(`/dashboard/events/${eventId}`)
      await expect(page.getByRole('heading', { name: 'Chọn ghế' })).toBeVisible()
    }

    const actionableSeat = page.locator('button[title*="AVAILABLE"]').first()
    await expect(actionableSeat).toBeVisible()

    await actionableSeat.click()

    const confirmSeatButton = page.getByRole('button', { name: 'Xác nhận đặt ghế' })
    await expect(confirmSeatButton).toBeVisible()

    await Promise.all([
      page.waitForURL(/\/dashboard\/payment/),
      confirmSeatButton.click(),
    ])

    await expect(page.getByRole('heading', { name: 'Thanh toán vé' })).toBeVisible()
    await expect(page.locator('select').first()).toHaveValue('vnpay')

    const observedPaymentQuery: Record<string, string> = {}
    const appBase = baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'

    await page.route('**/api/payment-ticket**', async (route) => {
      const reqUrl = new URL(route.request().url())
      observedPaymentQuery.userId = reqUrl.searchParams.get('userId') ?? ''
      observedPaymentQuery.eventId = reqUrl.searchParams.get('eventId') ?? ''
      observedPaymentQuery.categoryTicketId = reqUrl.searchParams.get('categoryTicketId') ?? ''
      observedPaymentQuery.seatIds = reqUrl.searchParams.get('seatIds') ?? ''

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentUrl: `${appBase}/dashboard/payment/success?status=success&method=vnpay&ticketIds=PW-E2E-001`,
        }),
      })
    })

    await Promise.all([
      page.waitForURL(/\/dashboard\/payment\/success\?status=success/),
      page.getByRole('button', { name: 'Thanh toán qua VNPay' }).click(),
    ])

    expect(observedPaymentQuery.eventId).toBe(String(eventId))
    expect(observedPaymentQuery.userId).not.toBe('')
    expect(observedPaymentQuery.categoryTicketId).not.toBe('')
    expect(observedPaymentQuery.seatIds).not.toBe('')
    expect(usingMockFallback === false || observedPaymentQuery.eventId === String(MOCK_EVENT_ID)).toBeTruthy()

    await expect(page.getByText('Thanh toán thành công', { exact: false })).toBeVisible()
    await expect(page.getByText('#PW-E2E-001')).toBeVisible()
  })
})
