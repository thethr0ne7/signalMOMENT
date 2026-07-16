declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        close: () => void
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void
          selectionChanged: () => void
        }
        openTelegramLink?: (url: string) => void
        openLink?: (url: string) => void
        initDataUnsafe?: {
          user?: { id?: number; first_name?: string; username?: string }
          start_param?: string
        }
      }
    }
  }
}

export const tg = window.Telegram?.WebApp

export function initTelegram() {
  tg?.ready()
  tg?.expand()
}

export function haptic(type: 'tap' | 'success' | 'error' = 'tap') {
  if (!tg?.HapticFeedback) return
  if (type === 'tap') tg.HapticFeedback.impactOccurred('light')
  if (type === 'success') tg.HapticFeedback.notificationOccurred('success')
  if (type === 'error') tg.HapticFeedback.notificationOccurred('error')
}

export function getPlayerName() {
  return tg?.initDataUnsafe?.user?.first_name || localStorage.getItem('signal_player_name') || 'Игрок'
}

export function getStartParam() {
  return tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('startapp') || 'solo'
}

export function shareSignal(score: number, accuracy: number, chainId: string) {
  const bot = import.meta.env.VITE_TELEGRAM_BOT || 'your_bot'
  const app = import.meta.env.VITE_TELEGRAM_APP || 'app'
  const deepLink = `https://t.me/${bot}/${app}?startapp=chain_${chainId}`
  const text = `Я поймал сигнал: ${score.toFixed(2)} сек, точность ${Math.round(accuracy)}%. Продолжи цепь и побей мой результат.`
  const url = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`
  if (tg?.openTelegramLink) tg.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}
