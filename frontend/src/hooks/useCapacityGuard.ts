import { useState, useEffect, useCallback } from 'react'
import { getOrganizerLimits, OrganizerLimits } from '../services/organizerLimitsService'
import { useAuth } from '../contexts/AuthContext'

export function calculateEffectiveCapacity(
  requestedCapacity: number = 0,
  ticketsSum: number = 0,
  seatCount: number = 0
): number {
  return Math.max(
    Number(requestedCapacity) || 0,
    Number(ticketsSum) || 0,
    Number(seatCount) || 0
  )
}

export function useCapacityGuard() {
  const { user } = useAuth()
  const [limits, setLimits] = useState<OrganizerLimits | null>(null)
  const [limitsError, setLimitsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalState, setModalState] = useState<{
    requestedCapacity: number
    maxAllowed: number
    currentTier: string
  }>({
    requestedCapacity: 120,
    maxAllowed: 100,
    currentTier: 'FREE',
  })

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setLimitsError(null)

    getOrganizerLimits().then(({ data, error }) => {
      if (!isMounted) return
      setIsLoading(false)
      if (error || !data) {
        setLimits(null)
        setLimitsError('Không thể xác thực hạn mức tài khoản (/limits lỗi). Vui lòng thử lại sau.')
      } else {
        setLimits(data)
        setLimitsError(null)
      }
    })

    return () => {
      isMounted = false
    }
  }, [user])

  const isSubmitBlocked = isLoading || Boolean(limitsError)

  // Role is taken directly from /limits response if available, fallback to AuthContext user.role
  const effectiveRole = (limits?.role || user?.role || '').toUpperCase()
  const isSchoolOrganizer = effectiveRole === 'SCHOOL_ORGANIZER'

  const checkCapacityExceeded = useCallback(
    (
      requestedCapacity: number = 0,
      ticketsSum: number = 0,
      seatCount: number = 0
    ): boolean => {
      // If /limits loading or errored, checkCapacityExceeded returns true (blocked)
      if (isLoading || limitsError || !limits) {
        return true
      }

      // If ENABLE_CAPACITY_GATING is false on backend (gatingEnabled === false), modal does not pop
      if (limits?.gatingEnabled === false) {
        setModalOpen(false)
        return false
      }

      // SCHOOL_ORGANIZER never sees upgrade modal
      if (isSchoolOrganizer) {
        setModalOpen(false)
        return false
      }

      if (!limits) return false

      const effective = calculateEffectiveCapacity(requestedCapacity, ticketsSum, seatCount)
      const max = limits.maxCapacityLimit

      // max === -1 means unlimited
      if (max > 0 && effective > max) {
        setModalState({
          requestedCapacity: effective,
          maxAllowed: max,
          currentTier: limits.tierCode || 'FREE',
        })
        setModalOpen(true)
        return true
      } else {
        // If user lowers capacity to <= max (e.g. 90), modal closes!
        setModalOpen(false)
        return false
      }
    },
    [isLoading, limitsError, isSchoolOrganizer, limits]
  )

  const handleApiPlanRequiredError = useCallback(
    (errData: any) => {
      if (isSchoolOrganizer) {
        setModalOpen(false)
        return false
      }
      if (limits?.gatingEnabled === false) {
        setModalOpen(false)
        return false
      }

      setModalState({
        requestedCapacity: errData.requested || 120,
        maxAllowed: errData.maxAllowed || limits?.maxCapacityLimit || 100,
        currentTier: errData.currentTier || limits?.tierCode || 'FREE',
      })
      setModalOpen(true)
      return true
    },
    [isSchoolOrganizer, limits]
  )

  return {
    limits,
    limitsError,
    isSubmitBlocked,
    modalOpen,
    setModalOpen,
    modalState,
    checkCapacityExceeded,
    handleApiPlanRequiredError,
    isSchoolOrganizer,
    effectiveRole,
  }
}
