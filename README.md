# Лови сигнал

Готовая MVP-сборка вирусной Telegram Mini Game.

## Что работает

- Canvas-игра «удерживай импульс» на 15 секунд.
- Целостность сигнала и точность.
- Рекорд и история попыток в localStorage.
- Telegram WebApp и haptic feedback с безопасным web-fallback.
- Deep-link sharing через `startapp=chain_<id>`.
- Адаптивный mobile-first интерфейс.
- Статическая production-сборка без обязательного backend.

## Запуск

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
```

Готовые файлы появятся в `dist/`. Их можно разместить на GitHub Pages, Cloudflare Pages, Netlify или другом HTTPS-хостинге.

## Telegram

1. Создайте бота через BotFather.
2. Создайте Mini App / настройте Menu Button.
3. Укажите HTTPS URL развёрнутой папки `dist`.
4. Скопируйте `.env.example` в `.env` и задайте:

```env
VITE_TELEGRAM_BOT=имя_бота_без_@
VITE_TELEGRAM_APP=short_name_мини_приложения
```

5. Пересоберите проект.

## Ограничение MVP

Результаты сейчас сохраняются на устройстве. Для глобальных цепей, лидерборда и античита подключите Supabase или другой backend.
