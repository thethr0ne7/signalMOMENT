declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void
        }
        openTelegramLink?: (url: string) => void
        initDataUnsafe?: {
          user?: { id?: number; first_name?: string; username?: string }
          start_param?: string
        }
      }
    }
  }
}

const webApp = window.Telegram?.WebApp

export const telegramAdapter = {
  init() {
    webApp?.ready()
    webApp?.expand()
  },

  haptic(type: 'tap' | 'success' | 'error' = 'tap') {
    if (!webApp?.HapticFeedback) return
    if (type === 'tap') webApp.HapticFeedback.impactOccurred('light')
    else webApp.HapticFeedback.notificationOccurred(type)
  },

  getPlayerName() {
    return webApp?.initDataUnsafe?.user?.first_name
      || localStorage.getItem('signal_player_name')
      || 'Игрок'
  },

  getStartParam() {
    return webApp?.initDataUnsafe?.start_param
      || new URLSearchParams(location.search).get('startapp')
      || 'solo'
  },

  shareSignal(score: number, accuracy: number, chainId: string) {
    const bot = import.meta.env.VITE_TELEGRAM_BOT || 'your_bot'
    const app = import.meta.env.VITE_TELEGRAM_APP || 'app'
    const deepLink = `https://t.me/${bot}/${app}?startapp=chain_${chainId}`
    const text = `Я поймал сигнал: ${score.toFixed(2)} сек, точность ${Math.round(accuracy)}%. Продолжи цепь и побей мой результат.`
    const url = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`

    if (webApp?.openTelegramLink) webApp.openTelegramLink(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  },
}
