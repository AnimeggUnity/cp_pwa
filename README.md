# Checkpoint PWA — 打卡考勤管理系統

> 專為台灣企業設計的離線優先打卡考勤 PWA，支援員工名冊管理、刷卡資料 ETL、薪資報表生成與機號異常比對。

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06b6d4?logo=tailwindcss)](https://tailwindcss.com)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)](https://vitejs.dev)

---

## 功能概覽

### 第一步：上傳打卡資料
- 支援拖放或點選上傳刷卡機匯出的 `.xlsx` 檔案
- 自動解析民國年日期格式（例：`1140210` → `2025-02-10`）
- 自動補全時間格式（例：`073251` → `07:32:51`）
- 跳過分頁頁首/頁尾雜訊列，過濾不合規資料
- 執行 **ETL 整合管線**：以員工名冊為基準進行 LEFT JOIN，依「員工 + 日期」分組、去重並排序打卡時間

### 員工名冊管理
- 支援手動新增、編輯、刪除單筆員工資料
- 支援貼上 TSV/CSV 批次匯入（自動偵測欄位標題）
- 雙格式智慧解析：
  - **格式 A**：完整員工名冊（班別、卡號、姓名、公務帳號、司機屬性）
  - **格式 B**：獨立司機名單（公務帳號、卡號、姓名），自動與現有名冊合併標記司機身分
- 資料持久化至 **IndexedDB**，自動降級為 localStorage 備援
- 啟動時自動偵測並移植舊版 localStorage 資料

### 薪資與考勤報表
| 報表類型 | 說明 |
|---|---|
| 夜點津貼彙整表 | 統計最後一筆打卡超過 21:00 的員工，按班別快速篩選 |
| 單日打卡查詢 | 查詢指定日期的全員打卡紀錄，支援雙欄列印排版 |
| 打卡紀錄完整查詢 | 每位員工獨立日曆卡片，自動補齊全月日期，標記缺勤 |

- 所有報表支援**瀏覽器列印**（含列印樣式優化）
- 夜點彙整表與單日查詢支援**匯出 Excel**（SheetJS）

### 機號設定
- 建立刷卡機台清單（機號、位置、允許班別）
- 支援貼上 TSV/CSV 批次匯入
- 標記「共用」機台，排除比對邏輯

### 全機號比對（異常偵測）
- 比對員工刷卡記錄與機台允許班別，自動找出跨班打卡異常
- 列出班別未設定的孤兒打卡記錄
- 支援分頁瀏覽、班別篩選與 Excel 匯出

---

## 技術架構

```
checkpoint_pwa/
├── src/
│   ├── App.tsx                   # 根元件，頁籤路由
│   ├── main.tsx                  # 應用程式進入點
│   ├── index.css                 # Tailwind 全域樣式
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx       # 左側導覽列
│   │   │   └── Navbar.tsx        # 頂部標題列
│   │   └── PWAPrompt.tsx         # PWA 安裝提示
│   ├── pages/
│   │   ├── PunchUpload.tsx       # 打卡 Excel 上傳與 ETL
│   │   ├── EmployeeRoster.tsx    # 員工名冊 CRUD
│   │   ├── SalaryReports.tsx     # 薪資考勤報表
│   │   ├── LeaveDeduction.tsx    # 假勤扣抵管理
│   │   ├── MachineConfig.tsx     # 機號設定管理
│   │   └── FullMachineMatch.tsx  # 全機號異常比對
│   ├── store/
│   │   └── usePunchStore.ts      # Zustand 全域狀態與業務邏輯
│   ├── types/
│   │   └── index.ts              # 共用 TypeScript 型別定義
│   └── lib/
│       └── utils.ts              # clsx/tailwind-merge 工具函式
├── public/
│   └── icons/                    # PWA 圖示
└── vite.config.ts                # Vite + PWA 設定
```

### 技術選型

| 類別 | 技術 |
|---|---|
| UI 框架 | React 19 |
| 語言 | TypeScript 5.8 |
| 樣式 | Tailwind CSS 3.4 |
| 狀態管理 | Zustand 5 |
| 建置工具 | Vite 5 |
| PWA | vite-plugin-pwa |
| 本地資料庫 | IndexedDB（idb-keyval）|
| Excel 讀寫 | SheetJS（xlsx）、ExcelJS |
| 圖示庫 | lucide-react |

---

## 快速開始

### 環境需求
- Node.js 18+
- npm 9+

### 安裝與啟動

```bash
# 安裝相依套件
npm install

# 啟動開發伺服器
npm run dev

# 型別檢查
npm run typecheck

# 建置正式版本
npm run build

# 預覽正式版本
npm run preview
```

### 部署至 GitHub Pages

```bash
npm run deploy
```

---

## 使用流程

```
1. 員工名冊管理  →  建立或匯入員工清單（必須先完成）
2. 機號設定      →  建立機台清單並設定允許班別（用於異常比對）
3. 上傳打卡資料  →  匯入刷卡機 Excel，執行 ETL 整合
4. 薪資報表      →  生成夜點津貼表、單日查詢或完整月曆報表
5. 全機號比對    →  找出跨班打卡異常與未設定班別的記錄
```

---

## 資料格式說明

### 打卡 Excel 格式
- 前 5 列為系統資訊，第 6 列起為欄位標題
- 必要欄位：`公務帳號`、`刷卡日期`（民國年，如 `1140210`）、`刷卡時間`（如 `073251`）

### 員工名冊匯入格式（格式 A）
```
班別	卡號	姓名	公務帳號	是否司機
業務一班	E001	王小明	u001	否
業務二班	E002	李小華	u002	是
```

### 司機名單匯入格式（格式 B）
```
公務帳號	卡號	姓名
u003	E003	張大偉
```

### 機號清單匯入格式
```
機號	位置	班別
M001	大門	共用
M002	業務部	業務一班,業務二班
```

---

## PWA 支援

本應用程式支援安裝為 PWA（Progressive Web App）：
- 離線快取靜態資源
- 可加入手機或桌面主畫面
- 所有資料儲存於本機瀏覽器（IndexedDB），不需後端伺服器

---

## License

MIT
