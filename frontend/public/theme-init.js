(() => {
  try {
    const path = window.location.pathname || '/'
    const isDashboardRoute = path === '/' || path.startsWith('/dashboard') || path.startsWith('/my-tickets')
    if (!isDashboardRoute) return

    const storedTheme = localStorage.getItem('theme')
    const hasDarkTheme = storedTheme === 'dark'
      || (storedTheme !== 'light' && Object.keys(localStorage).some((key) => key.startsWith('theme_user_') && localStorage.getItem(key) === 'dark'))

    document.documentElement.classList.toggle('dark', Boolean(hasDarkTheme))
  } catch {
    document.documentElement.classList.remove('dark')
  }
})()
