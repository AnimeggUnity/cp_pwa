import React from 'react';

const PWAPrompt: React.FC = () => {
  // 由於在 vite.config.ts 中暫時關閉了 PWA (disable: true)，此元件在初次上線時不會觸發。
  // 我們先保留其空殼結構，待未來開啟 PWA 快取時可直接啟用。
  return null;
};

export default PWAPrompt;
