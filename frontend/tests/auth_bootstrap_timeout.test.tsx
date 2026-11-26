// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import axios from 'axios'
import { AuthProvider, useAuth } from '../src/contexts/AuthContext'
import * as apiModule from '../src/config/api'

function AuthProbe() {
  const { loading, isAuthenticated, user } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
    </div>
  )
}

describe('AuthContext bootstrap timeout & fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    apiModule.setInMemoryToken(null)
    window.history.pushState({}, '', '/dashboard')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('skips /api/auth/me and exits loading when silent refresh fails', async () => {
    const refreshSpy = vi
      .spyOn(apiModule, 'requestTokenRefresh')
      .mockRejectedValue(new Error('timeout of 15000ms exceeded'))
    const getSpy = vi.spyOn(axios, 'get')

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('auth')).toHaveTextContent('false')
    expect(screen.getByTestId('email')).toHaveTextContent('none')
  })

  it('releases loading state via 16s safety timer if refresh hangs indefinitely', async () => {
    vi.spyOn(apiModule, 'requestTokenRefresh').mockImplementation(
      () => new Promise(() => {})
    )
    const getSpy = vi.spyOn(axios, 'get')

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await act(async () => {
      vi.advanceTimersByTime(16000)
    })

    expect(getSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('auth')).toHaveTextContent('false')
  })

  it('authenticates user when silent refresh and /api/auth/me succeed', async () => {
    vi.spyOn(apiModule, 'requestTokenRefresh').mockResolvedValue('valid-jwt-token')
    const getSpy = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        user: {
          id: 1,
          email: 'student@fpt.edu.vn',
          role: 'STUDENT',
        },
      },
    } as any)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getSpy).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        withCredentials: true,
        timeout: 10000,
      })
    )
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('auth')).toHaveTextContent('true')
    expect(screen.getByTestId('email')).toHaveTextContent('student@fpt.edu.vn')
  })
})
