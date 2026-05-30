import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
function buildTime(): string {
  const now = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}`;
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime()),
  },
  plugins: [
    react(),
    VitePWA({
      disable: true, // 暫時停用離線快取，待移轉完成後再開啟
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '打卡系統資料處理工具 - PWA 版',
        short_name: '打卡助手',
        description: '純前端打卡資料 ETL、夜點計算與請假扣款統計工具',
        theme_color: '#6366f1',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
})
