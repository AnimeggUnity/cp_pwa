import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { usePunchStore } from '../store/usePunchStore';
import { 
  Calculator, 
  UploadCloud, 
  Printer, 
  FileSpreadsheet, 
  X, 
  Search, 
  ChevronRight,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { LeaveRecord, Employee } from '../types';

export const LeaveDeduction: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  
  // Page UI States
  const [isReportActive, setIsReportActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);

  const employeeList = usePunchStore((state) => state.employeeList);
  const rawLeaveData = usePunchStore((state) => state.rawLeaveData);
  const setRawLeaveData = usePunchStore((state) => state.setRawLeaveData);
  const addLog = usePunchStore((state) => state.addLog);

  const DEDUCTION_RATES: Record<string, Record<string, number>> = {
    '事假': { '全天': 333, '半天': 167 },
    '傷病': { '全天': 167, '半天': 84 }
  };
  const LEAVE_ROUNDING_UNIT = 0.5;

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
    addLog(`選取請假檔案: ${file.name} (大小: ${(file.size / 1024).toFixed(1)} KB)`, 'info');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (!e.target?.result) return;
        const data = new Uint8Array(e.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        addLog(`讀取請假 Excel 成功。共載入 ${rows.length} 列。`, 'info');
        
        parseLeaveRows(rows);
      } catch (err: any) {
        addLog(`解析請假 Excel 失敗: ${err.message}`, 'error');
        alert('請假 Excel 解析失敗。');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseLeaveRows = (rows: any[][]) => {
    if (rows.length < 2) {
      addLog('請假 Excel 列數不足！', 'error');
      return;
    }
    
    // 1. Parse Year/Month from A1 title (e.g. 114年11月請假考勤表)
    const title = String(rows[0] && rows[0][0] ? rows[0][0] : '');
    const dateMatch = title.match(/(\d+)\s*年\s*(\d+)\s*月/);
    if (!dateMatch) {
      addLog('無法解析請假 Excel 的年月資訊！請確認首行首格包含「XX年XX月」的標題！', 'error');
      alert('請確認請假 Excel 的第 A1 儲存格包含「XX年XX月」的年月標題！');
      return;
    }
    
    const yearRoc = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const year = yearRoc + 1911;
    addLog(`成功解析請假年月：民國 ${yearRoc} 年 (西元 ${year} 年) ${month} 月`, 'success');
    
    // 2. Find row index where "人事編號" starts
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && String(rows[i][0] || '').trim() === '人事編號') {
        headerRowIndex = i;
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      addLog('無法在請假 Excel 中找到「人事編號」標題行！', 'error');
      alert('請確認請假 Excel 中有一列的 A 欄為「人事編號」！');
      return;
    }
    addLog(`找到請假表頭於第 ${headerRowIndex + 1} 行。開始解析月曆請假明細...`, 'info');
    
    // 3. Mapping configurations
    const LEAVE_TYPE_MAPPING: Record<string, string> = {
      "扣事": "事假",
      "扣病": "傷病",
      "扣特": "特休",
      "扣補": "補休",
      "生理": "傷病",
      "生理假": "傷病",
    };
    const LEAVE_PAIR_RE = /([^\d,]+)(\d+(?:\.\d+)?)/g;
    
    function parseRestDays(text: string) {
      if (!text || typeof text !== 'string') return [];
      const restDays: number[] = [];
      const weekdayMap: Record<string, number> = { "一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6 };
      for (const [char, idx] of Object.entries(weekdayMap)) {
        if (text.includes(`休${char}`) || text.includes(`例${char}`)) {
          if (!restDays.includes(idx)) restDays.push(idx);
        }
      }
      if (text.includes("例假") && !restDays.includes(6)) {
        restDays.push(6);
      }
      return restDays;
    }
    
    function expandLeaveDays(startDate: Date, numDays: number, restDays: number[]) {
      const dates: Date[] = [];
      const cur = new Date(startDate);
      let maxIter = numDays * 3;
      while (dates.length < numDays && maxIter > 0) {
        const jsDay = cur.getDay();
        const myWeekday = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0, Sun=6
        
        if (!restDays.includes(myWeekday)) {
          dates.push(new Date(cur));
        }
        cur.setDate(cur.getDate() + 1);
        maxIter--;
      }
      return dates;
    }
    
    function getExcelColumnLetter(colIndex: number) {
      let temp = colIndex;
      let letter = '';
      while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter;
        temp = Math.floor(temp / 26) - 1;
      }
      return letter;
    }
    
    function parseLeavePairs(cellText: string) {
      if (!cellText || typeof cellText !== 'string') return [];
      let cleanedText = cellText.replace(/[，，、；;\s]/g, ",");
      cleanedText = cleanedText.replace(/\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}/g, "").trim();
      
      const pairs: { leaveType: string; leaveDay: number; restDays: number[] }[] = [];
      let match;
      LEAVE_PAIR_RE.lastIndex = 0;
      
      while ((match = LEAVE_PAIR_RE.exec(cleanedText)) !== null) {
        let rawType = match[1].trim();
        rawType = rawType.replace(/^[,，、；;\s]+|[,，、；;\s]+$/g, "");
        if (!rawType) continue;
        
        const leaveDay = parseFloat(match[2]);
        if (leaveDay <= 0) continue;
        
        const restDays = parseRestDays(rawType);
        let leaveType = rawType.replace(/\([^)]*\)/g, "").trim();
        leaveType = LEAVE_TYPE_MAPPING[leaveType] || leaveType;
        
        pairs.push({ leaveType, leaveDay, restDays });
      }
      return pairs;
    }
    
    const parsedLeaves: LeaveRecord[] = [];
    let lastEmpId = '';
    let lastName = '';
    
    // 4. Traverse rows (header index + 2 is actual data)
    for (let i = headerRowIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;
      
      const emp_id = String(row[0] || '').trim() || lastEmpId;
      const name = String(row[1] || '').trim() || lastName;
      
      if (!emp_id) continue;
      lastEmpId = emp_id;
      lastName = name;
      
      const daysInMonth = new Date(year, month, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const colIndex = day + 1; // A=0 (Emp ID), B=1 (Name), C=2 (Day 1)...
        const cell = row[colIndex];
        
        if (cell === undefined || cell === null || String(cell).trim() === '') continue;
        
        const cellText = String(cell).trim();
        const pairs = parseLeavePairs(cellText);
        const dateObj = new Date(year, month - 1, day);
        
        if (pairs.length === 0) {
          let tempText = cellText.replace(/\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}/g, "").trim();
          tempText = tempText.replace(/\([^)]*\)/g, "").trim();
          
          const knownTypes = ["事假", "傷病", "特休", "補休", "生理", "生理假", "公假", "婚假", "喪假", "扣事", "扣病", "扣特", "扣補", "病假", "公出", "例日", "例假", "休假", "彈休"];
          
          if (tempText === "" || knownTypes.includes(tempText)) {
            continue;
          }
          
          const colLetter = getExcelColumnLetter(colIndex);
          addLog(`[警告] 無法解析 ${name}(${emp_id}) 於 ${month}/${day} 的請假文字: "${cellText}" (位於 Excel 第 ${i + 1} 行，第 ${colLetter} 欄)`, 'warning');
          continue;
        }
        
        pairs.forEach(pair => {
          if (pair.leaveDay === Math.floor(pair.leaveDay) && pair.leaveDay >= 1) {
            // Expansion for full whole day leaves
            const numDays = Math.floor(pair.leaveDay);
            const dates = pair.restDays.length > 0 
              ? expandLeaveDays(dateObj, numDays, pair.restDays)
              : Array.from({ length: numDays }, (_, idx) => {
                  const d = new Date(dateObj);
                  d.setDate(d.getDate() + idx);
                  return d;
                });
                
            dates.forEach(d => {
              const formattedDate = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
              const weekday = d.getDay();
              const weekdayZh = ["日", "一", "二", "三", "四", "五", "六"][weekday];
              const fullDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              
              parsedLeaves.push({
                emp_id,
                name,
                leave_type: pair.leaveType,
                source_text: cellText,
                leave_day: 1.0,
                date: formattedDate,
                full_date: fullDateStr,
                weekday_zh: weekdayZh
              });
            });
          } else {
            // Decimals (e.g. 0.5 days) stays on target date
            const formattedDate = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
            const weekday = dateObj.getDay();
            const weekdayZh = ["日", "一", "二", "三", "四", "五", "六"][weekday];
            const fullDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            parsedLeaves.push({
              emp_id,
              name,
              leave_type: pair.leaveType,
              source_text: cellText,
              leave_day: pair.leaveDay,
              date: formattedDate,
              full_date: fullDateStr,
              weekday_zh: weekdayZh
            });
          }
        });
      }
    }
    
    setRawLeaveData(parsedLeaves);
    addLog(`請假 Excel 解析完成！共轉換 ${parsedLeaves.length} 筆請假明細記錄。`, 'success');
  };

  const handleGenerateReport = () => {
    if (rawLeaveData.length === 0) return;
    setIsReportActive(true);
    addLog('生成請假扣款統計報表...', 'info');
  };

  // Close report view
  const handleCloseReport = () => {
    setIsReportActive(false);
    setSearchQuery('');
  };

  // ==========================================
  // Report Calculations & Roster Rendering
  // ==========================================
  const getLeaveReportList = () => {
    const empMap = new Map(employeeList.map(e => [e.emp_id, e]));
    const summary = new Map<string, {
      emp_id: string;
      name: string;
      shift_class: string;
      is_driver: boolean;
      sick_days: number;
      sick_deduction: number;
      personal_days: number;
      personal_deduction: number;
      other_types: Set<string>;
      other_days: number;
      total_deduction: number;
      details: {
        date: string;
        leave_type: string;
        source_text: string;
        leave_day: number;
        adjustedDay: number;
        deduction: number;
      }[];
    }>();

    rawLeaveData.forEach(leave => {
      const emp = empMap.get(leave.emp_id) || employeeList.find(e => e.name === leave.name) || ({} as Partial<Employee>);
      const emp_id = emp.emp_id || leave.emp_id;
      const name = emp.name || leave.name || '未知';
      const shift_class = emp.shift_class || '-';
      const is_driver = emp.is_driver || false;

      if (!summary.has(emp_id)) {
        summary.set(emp_id, {
          emp_id,
          name,
          shift_class,
          is_driver,
          sick_days: 0,
          sick_deduction: 0,
          personal_days: 0,
          personal_deduction: 0,
          other_types: new Set<string>(),
          other_days: 0,
          total_deduction: 0,
          details: []
        });
      }

      const record = summary.get(emp_id)!;
      const rawDays = leave.leave_day;
      const adjustedDay = Math.ceil(rawDays / LEAVE_ROUNDING_UNIT) * LEAVE_ROUNDING_UNIT;
      
      let deduction = 0;
      const rates = DEDUCTION_RATES[leave.leave_type];
      
      if (rates) {
        const fullDays = Math.floor(adjustedDay);
        const hasHalfDay = (adjustedDay % 1) >= LEAVE_ROUNDING_UNIT;
        deduction = (fullDays * rates['全天']) + (hasHalfDay ? rates['半天'] : 0);
      }

      record.details.push({
        date: leave.date,
        leave_type: leave.leave_type,
        source_text: leave.source_text,
        leave_day: rawDays,
        adjustedDay,
        deduction
      });

      if (leave.leave_type === '傷病') {
        record.sick_days += rawDays;
        record.sick_deduction += deduction;
      } else if (leave.leave_type === '事假') {
        record.personal_days += rawDays;
        record.personal_deduction += deduction;
      } else {
        record.other_types.add(leave.leave_type);
        record.other_days += rawDays;
      }
      
      record.total_deduction = record.sick_deduction + record.personal_deduction;
    });

    const query = searchQuery.trim().toLowerCase();
    let list = Array.from(summary.values()).sort((a, b) => (a.emp_id || '').localeCompare(b.emp_id || ''));

    if (query) {
      list = list.filter(emp => 
        emp.name.toLowerCase().includes(query) || 
        emp.emp_id.toLowerCase().includes(query) ||
        emp.shift_class.toLowerCase().includes(query)
      );
    }

    return list;
  };

  const handleExportExcel = () => {
    const tableEl = document.getElementById('rendered-leave-report-table');
    if (!tableEl) {
      alert('找不到可供匯出的請假扣款報表表格！');
      return;
    }
    try {
      const workbook = XLSX.utils.table_to_book(tableEl, { sheet: "請假扣款報表" });
      XLSX.writeFile(workbook, `請假扣款報表_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (err: any) {
      alert('匯出 Excel 失敗：' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Excel Upload and trigger card */}
      <div className="glass-panel p-6 no-print">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-indigo-400" />
          請假扣款計算中心
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          請在下方拖入或點選請假資料 Excel。完成後點選「生成請假扣款報表」，系統將在下方即時渲染統計結果。
        </p>

        {/* Drag Drop Area */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={cn(
            "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-350 bg-slate-950/20",
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
          <UploadCloud className={cn(
            "w-12 h-12 mb-3 transition-colors duration-250",
            fileName ? "text-indigo-400" : "text-slate-500"
          )} />
          <h3 className="font-semibold text-white text-sm mb-1">
            {fileName ? fileName : '拖放或點選上傳請假資料'}
          </h3>
          <p className="text-sm text-slate-500">
            {fileName && fileSize ? `檔案大小: ${fileSize} KB` : '請上傳 請假資料.xlsx'}
          </p>
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <button
            onClick={handleGenerateReport}
            disabled={rawLeaveData.length === 0}
            className="btn-premium w-100 py-3 flex items-center justify-center gap-2 text-sm shadow-indigo-600/10"
          >
            <Calculator className="w-4 h-4" />
            生成請假扣款報表
          </button>
        </div>
      </div>

      {/* Waiting Placeholder */}
      {!isReportActive && (
        <div className="glass-panel text-center py-12 bg-slate-900/20 border-dashed border-slate-800/80 no-print">
          <Calculator className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-sm font-bold text-slate-400">等待生成請假扣款報表</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
            請先在上方上傳請假考勤 Excel 檔案，然後點擊「生成請假扣款報表」。
          </p>
        </div>
      )}

      {/* Report rendering block */}
      {isReportActive && (() => {
        const list = getLeaveReportList();
        const totalSickDeduction = list.reduce((sum, i) => sum + i.sick_deduction, 0);
        const totalPersonalDeduction = list.reduce((sum, i) => sum + i.personal_deduction, 0);
        const totalDeduction = totalSickDeduction + totalPersonalDeduction;

        return (
          <div className="space-y-6">
            {/* Header tools */}
            <div className="glass-panel p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-slate-800/60 no-print">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  員工請假扣款統計報表
                </h3>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-44">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <Search className="w-3.5 h-3.5 text-slate-500" />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜尋姓名、編號或班別..."
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={() => window.print()}
                    className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                    title="列印報表"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    列印
                  </button>
                  <button 
                    onClick={handleExportExcel}
                    className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                    title="下載 Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                    Excel
                  </button>
                  <button 
                    onClick={handleCloseReport}
                    className="p-2 border border-slate-850 hover:bg-rose-950/30 text-slate-500 hover:text-rose-400 rounded-lg text-xs flex items-center gap-1 transition-colors"
                    title="關閉報表"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="page-header text-center mb-6 py-2 border-b border-slate-900 hidden print:block">
                <h2 className="text-xl font-bold text-black">員工請假扣款統計報表</h2>
                <div className="text-xs text-gray-500 mt-1">生成時間: {new Date().toLocaleString()}</div>
              </div>

              {/* Stats badges */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 no-print">
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                  <span className="text-sm text-slate-500 uppercase tracking-wider font-semibold">請假員工數</span>
                  <div className="text-xl font-bold text-white mt-1">{list.length} 人</div>
                </div>
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                  <span className="text-sm text-slate-500 uppercase tracking-wider font-semibold text-rose-400">傷病總扣款</span>
                  <div className="text-xl font-bold text-rose-400 mt-1">${totalSickDeduction.toLocaleString()}</div>
                </div>
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                  <span className="text-sm text-slate-500 uppercase tracking-wider font-semibold text-amber-400">事假總扣款</span>
                  <div className="text-xl font-bold text-amber-400 mt-1">${totalPersonalDeduction.toLocaleString()}</div>
                </div>
                <div className="bg-slate-950/40 border border-emerald-500/20 bg-emerald-500/[0.02] p-4 rounded-xl">
                  <span className="text-sm text-slate-500 uppercase tracking-wider font-semibold text-emerald-400">總扣款金額</span>
                  <div className="text-xl font-bold text-emerald-400 mt-1">${totalDeduction.toLocaleString()}</div>
                </div>
              </div>

              {/* Roster table */}
              <div className="overflow-x-auto border border-slate-850 bg-slate-950/20 rounded-xl">
                <table className="w-full text-left border-collapse text-xs" id="rendered-leave-report-table">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold">
                      <th className="p-3 text-left">員工編號</th>
                      <th className="p-3 text-left">姓名</th>
                      <th className="p-3 text-left">班別</th>
                      <th className="p-3 text-right">傷病天數</th>
                      <th className="p-3 text-right text-rose-400">傷病扣款</th>
                      <th className="p-3 text-right">事假天數</th>
                      <th className="p-3 text-right text-amber-400">事假扣款</th>
                      <th className="p-3 text-left">其他假別</th>
                      <th className="p-3 text-right">其他天數</th>
                      <th className="p-3 text-right text-emerald-400 font-bold">總扣款</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((emp) => {
                      const isExpanded = expandedEmpId === emp.emp_id;

                      return (
                        <React.Fragment key={emp.emp_id}>
                          <tr 
                            onClick={() => setExpandedEmpId(isExpanded ? null : emp.emp_id)}
                            className="border-b border-slate-900 hover:bg-slate-900/30 text-slate-300 cursor-pointer"
                          >
                            <td className="p-3 font-mono flex items-center gap-1.5">
                              <ChevronRight className={cn("w-3.5 h-3.5 text-slate-500 transition-transform", isExpanded && "rotate-90")} />
                              {emp.emp_id}
                            </td>
                            <td className="p-3 font-semibold text-white">
                              {emp.is_driver && <span className="px-1 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold rounded-lg me-1">司機</span>}
                              {emp.name}
                            </td>
                            <td className="p-3">{emp.shift_class}</td>
                            <td className="p-3 text-right font-mono">{emp.sick_days.toFixed(2)}</td>
                            <td className="p-3 text-right font-bold text-rose-400 font-mono">${emp.sick_deduction.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono">{emp.personal_days.toFixed(2)}</td>
                            <td className="p-3 text-right font-bold text-amber-400 font-mono">${emp.personal_deduction.toLocaleString()}</td>
                            <td className="p-3 truncate max-w-[8rem]">{Array.from(emp.other_types).join(', ') || '-'}</td>
                            <td className="p-3 text-right font-mono">{emp.other_days.toFixed(2)}</td>
                            <td className="p-3 text-right font-bold text-emerald-400 font-mono">${emp.total_deduction.toLocaleString()}</td>
                          </tr>
                          
                          {/* Expanded detailed accordion */}
                          {isExpanded && (
                            <tr className="bg-slate-950/40 border-b border-slate-900 no-print">
                              <td colSpan={10} className="p-4">
                                <div className="border border-slate-850 rounded-xl p-4 bg-slate-950/20 max-w-xl">
                                  <h5 className="font-bold text-xs text-indigo-400 mb-3 flex items-center gap-1">
                                    <Info className="w-3.5 h-3.5" />
                                    {emp.name} ({emp.emp_id}) 的請假明細與扣款運算
                                  </h5>

                                  <table className="w-full text-left border-collapse text-sm border border-slate-850 rounded-lg overflow-hidden">
                                    <thead>
                                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                                        <th className="p-2">請假日期</th>
                                        <th className="p-2">原始假別備註</th>
                                        <th className="p-2 text-right">原始天數</th>
                                        <th className="p-2 text-right">半天進位天數</th>
                                        <th className="p-2 text-right text-rose-400">計算扣款</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {emp.details.map((d, index) => (
                                        <tr key={index} className="border-b border-slate-900 hover:bg-slate-900/30 text-slate-300">
                                          <td className="p-2 font-mono">{d.date}</td>
                                          <td className="p-2">
                                            <span className={cn(
                                              "px-1.5 py-0.5 rounded text-xs font-bold",
                                              d.leave_type === '事假' && "bg-amber-500/10 border border-amber-500/20 text-amber-400",
                                              d.leave_type === '傷病' && "bg-rose-500/10 border border-rose-500/20 text-rose-400",
                                              d.leave_type !== '事假' && d.leave_type !== '傷病' && "bg-slate-800 border border-slate-700 text-slate-400"
                                            )}>
                                              {d.source_text}
                                            </span>
                                          </td>
                                          <td className="p-2 text-right font-mono">{d.leave_day.toFixed(2)} 天</td>
                                          <td className="p-2 text-right font-mono text-slate-500">({d.adjustedDay.toFixed(2)} 天)</td>
                                          <td className="p-2 text-right font-bold text-rose-400 font-mono">${d.deduction.toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footnote Rule card */}
              <div className="mt-6 border border-slate-850 p-4 rounded-xl bg-slate-950/20">
                <h5 className="font-bold text-white text-xs mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  扣款規則說明：
                </h5>
                <ul className="text-sm text-slate-400 space-y-1.5 pl-4 list-disc">
                  <li>事假：1 天 = $333，半天 = $167，不足半天以半天計（無條件進位到以 0.5 天為單位）。</li>
                  <li>傷病：1 天 = $167，半天 = $84，不足半天以半天計（無條件進位到以 0.5 天為單位；生理假比照傷病假）。</li>
                  <li>其他假別（如特休、婚假、喪假、補休等）不予扣款。</li>
                  <li><strong>備註 (修正版)</strong>：採用天數累加制。例如：當月請事假累計 1.5 天，扣款 = 333 + 167 = $500 元。</li>
                </ul>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
