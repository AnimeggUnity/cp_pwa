import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { usePunchStore } from '../store/usePunchStore';
import { UploadCloud, CheckCircle2, Play, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import type { PunchRecord } from '../types';

export const PunchUpload: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);

  const employeeCount = usePunchStore((state) => state.employeeList.length);
  const rawPunchData = usePunchStore((state) => state.rawPunchData);
  const setRawPunchData = usePunchStore((state) => state.setRawPunchData);
  const runETLPipeline = usePunchStore((state) => state.runETLPipeline);
  const addLog = usePunchStore((state) => state.addLog);
  const isETLReady = usePunchStore((state) => state.integratedPunchData.length > 0);

  const COLUMN_NAMING: Record<string, string> = {
    '序號': 'seq_no',
    '公務帳號': 'account_id',
    '身分證字號': 'id_number',
    '人員姓名': 'name',
    '刷卡日期': 'punch_date',
    '刷卡時間': 'punch_time',
    '刷卡種類': 'punch_type',
    '機號': 'machine_id',
    '位置': 'location'
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1));
    addLog(`選取打卡 Excel 檔案: ${file.name} (大小: ${(file.size / 1024).toFixed(1)} KB)`, 'info');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (!e.target?.result) return;
        const data = new Uint8Array(e.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse into a 2D array
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        addLog(`讀取打卡 Excel 成功。共載入 ${rows.length} 列。開始 ETL 欄位標準化與格式轉換...`, 'info');
        
        parseExcelRows(rows);
      } catch (err: any) {
        addLog(`解析打卡 Excel 失敗: ${err.message}`, 'error');
        alert('打卡 Excel 解析失敗，請確認檔案格式是否正確。');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseExcelRows = (rows: any[][]) => {
    const PUNCH_SKIP_ROWS = 5; // Skip first 5 rows, 6th row is header

    if (rows.length <= PUNCH_SKIP_ROWS) {
      addLog('Excel 總列數不足以跳過前 5 行，無效的打卡資料！', 'error');
      alert('無效的打卡資料，總列數不足。');
      return;
    }

    const headerRow = rows[PUNCH_SKIP_ROWS];
    if (!headerRow || !Array.isArray(headerRow)) {
      addLog('無效的表頭列！', 'error');
      return;
    }

    const indexToKey = headerRow.map(col => {
      const trimmed = col ? String(col).trim() : '';
      return COLUMN_NAMING[trimmed] || null;
    });

    const requiredKeys = ['account_id', 'punch_date', 'punch_time'];
    const missingKeys = requiredKeys.filter(key => !indexToKey.includes(key));

    if (missingKeys.length > 0) {
      const reverseMapping = Object.fromEntries(Object.entries(COLUMN_NAMING).map(([k, v]) => [v, k]));
      const missingChinese = missingKeys.map(k => reverseMapping[k] || k);
      addLog(`打卡 Excel 缺少必要欄位: [${missingChinese.join(', ')}]，請檢查檔案格式！`, 'error');
      alert(`打卡 Excel 缺少必要欄位: [${missingChinese.join(', ')}]`);
      return;
    }

    const parsedRecords: PunchRecord[] = [];
    let skippedPaginationCount = 0;
    let skippedValidationCount = 0;

    for (let i = PUNCH_SKIP_ROWS + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const record: Record<string, any> = {};
      row.forEach((val, idx) => {
        const key = indexToKey[idx];
        if (key) {
          record[key] = val !== undefined && val !== null ? String(val).trim() : '';
        }
      });

      // Filter based on sequence number
      if (!record.seq_no) {
        skippedPaginationCount++;
        continue;
      }
      const parsedSeq = parseInt(record.seq_no, 10);
      if (isNaN(parsedSeq)) {
        skippedPaginationCount++;
        continue;
      }
      record.seq_no = parsedSeq;

      // ROC Date to AD Conversion (e.g. 1140210 -> 2025-02-10)
      if (record.punch_date && record.punch_date.length === 7 && /^\d+$/.test(record.punch_date)) {
        const year = parseInt(record.punch_date.substring(0, 3), 10) + 1911;
        const month = record.punch_date.substring(3, 5);
        const day = record.punch_date.substring(5, 7);
        record.punch_date = `${year}-${month}-${day}`;
      }

      // Time colon insertion (e.g. 073251 -> 07:32:51)
      if (record.punch_time && !record.punch_time.includes(':')) {
        const padded = record.punch_time.padStart(6, '0');
        if (padded.length === 6) {
          record.punch_time = `${padded.substring(0, 2)}:${padded.substring(2, 4)}:${padded.substring(4, 6)}`;
        }
      }

      // Validation
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const timePattern = /^\d{2}:\d{2}:\d{2}$/;

      if (!record.account_id || !datePattern.test(record.punch_date) || !timePattern.test(record.punch_time)) {
        skippedValidationCount++;
        continue;
      }

      parsedRecords.push(record as PunchRecord);
    }

    setRawPunchData(parsedRecords);
    const validationMsg = skippedValidationCount > 0 ? `，過濾不合規行數 ${skippedValidationCount} 筆` : '';
    addLog(`打卡 Excel 解析完成！共轉換 ${parsedRecords.length} 筆有效打卡記錄，過濾分頁頁首/頁尾 ${skippedPaginationCount} 行${validationMsg}。`, 'success');
  };

  const handleExecuteETL = () => {
    if (employeeCount === 0) {
      alert('請先到「員工名冊管理」建立或貼上員工名冊！');
      return;
    }
    const res = runETLPipeline();
    if (res.success) {
      alert(`資料整理 (ETL) 執行成功！共整理 ${res.count} 筆打卡資料。\n日期區間: ${res.dateRange}\n請至「薪資報表中心」進行查詢。`);
    } else {
      alert('資料整理發生錯誤，請檢查系統日誌。');
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <UploadCloud className="w-6 h-6 text-indigo-400" />
          第一步：上傳打卡資料
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          請在下方拖入或點選上傳刷卡資料的 Excel。完成後點選「執行資料整理 (ETL)」以進行標準化對齊。
        </p>

        {/* Drag and Drop Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={cn(
            "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-350 bg-slate-950/20",
            isDragOver 
              ? "border-indigo-500 bg-indigo-500/5 shadow-inner" 
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-950/40"
          )}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx"
            className="hidden"
          />
          <FileSpreadsheet className={cn(
            "w-14 h-14 mb-4 transition-colors duration-250",
            fileName ? "text-indigo-400" : "text-slate-500"
          )} />
          <h3 className="font-semibold text-white text-base mb-1">
            {fileName ? fileName : '拖放或點選上傳檔案'}
          </h3>
          <p className="text-xs text-slate-500">
            {fileName && fileSize ? `檔案大小: ${fileSize} KB` : '接受的檔案類型: 刷卡資料 .xlsx'}
          </p>
        </div>

        {/* Information warning if employee roster is empty */}
        {employeeCount === 0 && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
            提醒：目前「員工名冊」沒有任何員工。請在執行 ETL 整理前，先前往「員工名冊管理」建立名冊，否則將無法自動對齊班別與司機屬性。
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6">
          <button
            onClick={handleExecuteETL}
            disabled={rawPunchData.length === 0 || employeeCount === 0}
            className="btn-premium w-100 py-3.5 flex items-center justify-center gap-2 text-base shadow-indigo-600/10"
          >
            {isETLReady ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin-slow" />
                重新執行資料整理 (ETL)
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                執行資料整理 (ETL)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Roster & Loaded Excel Status Card */}
      {rawPunchData.length > 0 && (
        <div className="glass-panel p-6 border-slate-800/80 bg-slate-900/40">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Excel 解析狀態
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
              <span className="text-xs text-slate-500">原始打卡列數</span>
              <div className="text-2xl font-bold text-indigo-400 mt-1">{rawPunchData.length} 筆</div>
            </div>
            <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
              <span className="text-xs text-slate-500">系統員工數</span>
              <div className="text-2xl font-bold text-violet-400 mt-1">{employeeCount} 人</div>
            </div>
            <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
              <span className="text-xs text-slate-500">狀態</span>
              <div className="text-lg font-bold text-white mt-2">
                {isETLReady ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    已對齊整合完畢
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    等待執行 ETL
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
