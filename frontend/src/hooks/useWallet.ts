import { useState, useEffect, useRef } from 'react'

/**
 * Event Center để phát tín hiệu refresh balance
 * Được dùng khi có thay đổi về tiền (thanh toán, hoàn tiền, báo cáo...)
 */
class WalletEventCenter {
    private listeners: Set<() => void> = new Set()

    subscribe(callback: () => void) {
        this.listeners.add(callback)
        return () => {
            this.listeners.delete(callback)
        }
    }

    emit() {
        this.listeners.forEach(callback => callback())
    }
}

const walletEventCenter = new WalletEventCenter()

export function emitWalletRefresh() {
    walletEventCenter.emit()
}

/**
 * Hook useWallet
 * - Tự động fetch balance từ /api/wallet/balance
 * - Cập nhật khi component mount hoặc khi token thay đổi
 * - Tự động refresh khi nhận signal từ walletEventCenter
 * - Return: balance (số tiền), loading, error, và refetch function
 */
export function useWallet() {
    const [balance, setBalance] = useState<number>(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const isMountedRef = useRef(true)

    const fetchBalance = async () => {
        try {
            setLoading(true)
            setError(null)

            const token = localStorage.getItem('token')
            if (!token) {
                setBalance(0)
                setLoading(false)
                return
            }

            const response = await fetch('/api/wallet/balance', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const data = await response.json()

            // Log để debug
            console.log('[useWallet] Balance response:', data)

            // Xử lý response - có thể API trả về { balance: 100000 } hoặc { data: { balance: 100000 } }
            let balanceValue = 0
            if (typeof data.balance === 'number') {
                balanceValue = data.balance
            } else if (data.data?.balance !== undefined) {
                balanceValue = data.data.balance
            } else if (typeof data === 'number') {
                balanceValue = data
            }

            if (isMountedRef.current) {
                setBalance(balanceValue)
                setLoading(false)
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Failed to fetch balance'
            console.error('[useWallet] Error:', errMsg)
            if (isMountedRef.current) {
                setError(errMsg)
                setLoading(false)
                setBalance(0)
            }
        }
    }

    // Fetch balance khi component mount
    useEffect(() => {
        isMountedRef.current = true
        fetchBalance()

        return () => {
            isMountedRef.current = false
        }
    }, [])

    // Subscribe to wallet refresh events
    useEffect(() => {
        const unsubscribe = walletEventCenter.subscribe(fetchBalance)
        return unsubscribe
    }, [])

    return {
        balance,
        loading,
        error,
        refetch: fetchBalance,
    }
}
