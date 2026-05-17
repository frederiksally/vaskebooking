'use client'

import { useEffect } from 'react'

// Registers the service worker and keeps it fresh:
// - on every page-show / visibility change, ask for an update check
// - when a new worker activates, reload the page so the user sees fresh code
//
// iOS PWAs cache aggressively; this is what makes "the app updated overnight"
// actually work without manual reinstalls.
export function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let reg: ServiceWorkerRegistration | null = null
    let reloaded = false

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((r) => {
        reg = r
        r.update()
      })
      .catch(() => { /* ignore */ })

    const onControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') reg?.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('focus', checkForUpdate)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', checkForUpdate)
      window.removeEventListener('focus', checkForUpdate)
    }
  }, [])

  return null
}
