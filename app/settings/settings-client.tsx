'use client'

import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { urlBase64ToUint8Array, isIOS, isStandalone, pushSupported } from '@/lib/push-client'
import { subscribeUser, unsubscribeUser, setNotifPrefs } from '@/app/actions/push'
import { logout } from '@/app/actions/auth'

interface Props {
  apartment: string
  initialReminder: boolean
  initialFreed: boolean
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function SettingsClient({ apartment, initialReminder, initialFreed }: Props) {
  const [supported, setSupported] = useState(false)
  const [iosBlocked, setIosBlocked] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [reminder, setReminder] = useState(initialReminder)
  const [freed, setFreed] = useState(initialFreed)
  const [installPromptEvt, setInstallPromptEvt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    setSupported(pushSupported())
    setIosBlocked(isIOS() && !isStandalone())
    if (pushSupported()) {
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription().then((s) => setSubscribed(!!s)))
    }
    const onInstall = (e: Event) => { e.preventDefault(); setInstallPromptEvt(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  async function enablePush() {
    if (iosBlocked) {
      toast.message('Tilføj appen til hjemmeskærm først', {
        description: 'Tryk på del-ikonet i Safari og vælg "Tilføj til hjemmeskærm".',
      })
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    const json = sub.toJSON()
    const res = await subscribeUser({
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    })
    if (!res.ok) { toast.error('Kunne ikke aktivere notifikationer'); return }
    setSubscribed(true)
    toast.success('Notifikationer slået til')
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await unsubscribeUser(sub.endpoint)
      await sub.unsubscribe()
    }
    setSubscribed(false)
  }

  async function onReminderChange(v: boolean) {
    setReminder(v)
    await setNotifPrefs({ reminder: v })
  }

  async function onFreedChange(v: boolean) {
    setFreed(v)
    await setNotifPrefs({ freed: v })
  }

  async function install() {
    if (!installPromptEvt) return
    await installPromptEvt.prompt()
    setInstallPromptEvt(null)
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader><CardTitle>Lejlighed</CardTitle></CardHeader>
        <CardContent>
          <span>{apartment}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notifikationer</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!supported && <p className="text-sm text-muted-foreground">Push-notifikationer kræver en moderne browser.</p>}
          {supported && iosBlocked && (
            <p className="text-sm text-muted-foreground">Tilføj appen til hjemmeskærm for at aktivere notifikationer.</p>
          )}
          {supported && !iosBlocked && (
            <>
              <div className="flex items-center justify-between">
                <Label>Push aktiveret</Label>
                <Switch checked={subscribed} onCheckedChange={(v) => v ? enablePush() : disablePush()} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label htmlFor="reminder">Påmindelse 30 min før vasketid</Label>
                <Switch id="reminder" disabled={!subscribed} checked={reminder} onCheckedChange={onReminderChange} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="freed">Besked når en tid du holder øje med, bliver ledig</Label>
                <Switch id="freed" disabled={!subscribed} checked={freed} onCheckedChange={onFreedChange} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>App</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {installPromptEvt && <Button onClick={install} className="w-full">Tilføj til hjemmeskærm</Button>}
          {isIOS() && !isStandalone() && (
            <p className="text-sm text-muted-foreground">På iPhone: tryk på del-ikonet i Safari → "Tilføj til hjemmeskærm".</p>
          )}
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">Log ud</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
