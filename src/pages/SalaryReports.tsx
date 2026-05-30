import React, { useState, useEffect } from 'react';
import { usePunchStore } from '../store/usePunchStore';
import { 
  LineChart, 
  Moon, 
  Calendar, 
  FileText, 
  Printer, 
  FileSpreadsheet, 
  X, 
  Search,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import type { IntegratedRecord } from '../types';

export const SalaryReports: React.FC = () => {
  const integratedPunchData = usePunchStore((state) => state.integratedPunchData);
  const availableDates = usePunchStore((state) => state.availableDates);
  const isETLReady = integratedPunchData.length > 0;

  // States
  const [reportType, setReportType] = useState<'none' | 'night' | 'daily' | 'full'>('none');
  const [reportQuery, setReportQuery] = useState('');
  
  // Night Report Filter State
  const [nightShiftFilter, setNightShiftFilter] = useState('all');

  // Daily Report States
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isPrintLayout, setIsPrintLayout] = useState(false);

  const threshold = '21:00:00';
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

  useEffect(() => {
    if (availableDates.length > 0 && !selectedDate) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates]);

  const handleCloseReport = () => {
    setReportType('none');
    setReportQuery('');
  };

  // ==========================================
  // Report A: Night Meal Allowance Calculations
  // ==========================================
  const getNightMealList = (skipShiftFilter = false) => {
    const summaryMap = new Map<string, {
      emp_id: string;
      name: string;
      shift_class: string;
      is_driver: boolean;
      count: number;
      dates: string[];
    }>();

    integratedPunchData.forEach(row => {
      if (row.punch_times.length === 0) return;
      const lastTime = row.punch_times[row.punch_times.length - 1];

      if (lastTime > threshold) {
        const key = row.emp_id;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            emp_id: row.emp_id,
            name: row.name,
            shift_class: row.shift_class,
            is_driver: row.is_driver,
            count: 0,
            dates: []
          });
        }
        const record = summaryMap.get(key)!;
        record.count++;
        record.dates.push(row.punch_date.substring(8)); // Just day (DD)
      }
    });

    const query = reportQuery.trim().toLowerCase();
    let result = Array.from(summaryMap.values())
      .sort((a, b) => (a.emp_id || '').localeCompare(b.emp_id || ''));

    // Filter by text search
    if (query) {
      result = result.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.emp_id.toLowerCase().includes(query) ||
        item.shift_class.toLowerCase().includes(query)
      );
    }

    // Filter by shift filter button
    if (!skipShiftFilter && nightShiftFilter !== 'all') {
      result = result.filter(item => item.shift_class === nightShiftFilter);
    }

    return result;
  };

  // Get active shifts specifically for night allowance list
  const getNightShifts = () => {
    const summaryMap = new Map<string, string>();
    integratedPunchData.forEach(row => {
      if (row.punch_times.length === 0) return;
      const lastTime = row.punch_times[row.punch_times.length - 1];
      if (lastTime > threshold) {
        summaryMap.set(row.shift_class, row.shift_class);
      }
    });
    return Array.from(summaryMap.values()).sort();
  };

  // ==========================================
  // Report B: Daily Punch Inquiry
  // ==========================================
  const getDailyPunchList = () => {
    const activeDate = selectedDate || availableDates[0];
    if (!activeDate) return [];

    let result = integratedPunchData.filter(r => r.punch_date === activeDate)
      .sort((a, b) => 
        (a.shift_class || '').localeCompare(b.shift_class || '') || 
        (a.emp_id || '').localeCompare(b.emp_id || '')
      );

    const query = reportQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(item => 
        item.name.toLowerCase().includes(query) || 
        item.emp_id.toLowerCase().includes(query) ||
        item.shift_class.toLowerCase().includes(query)
      );
    }

    return result;
  };

  // Group Daily Data for Double Column Layout
  const getGroupedDailyData = (data: IntegratedRecord[]) => {
    const classGroups = new Map<string, IntegratedRecord[]>();
    data.forEach(row => {
      if (!classGroups.has(row.shift_class)) {
        classGroups.set(row.shift_class, []);
      }
      classGroups.get(row.shift_class)!.push(row);
    });
    return Array.from(classGroups.entries()).sort(([a], [b]) => a.localeCompare(b));
  };

  // ==========================================
  // Report C: Full Calendar Attendance Table
  // ==========================================
  const getFullPunchList = () => {
    if (availableDates.length === 0) return { dates: [], employees: [] };

    // Supplement all dates from min to max date
    const sortedDates = [...availableDates].sort();
    const minDate = new Date(sortedDates[0]);
    const maxDate = new Date(sortedDates[sortedDates.length - 1]);
    
    const fullDateList: { date: string; displayDate: string; weekday: string }[] = [];
    
    let current = new Date(minDate);
    while (current <= maxDate) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      fullDateList.push({
        date: dateStr,
        displayDate: `${mm}-${dd}`,
        weekday: weekdayNames[current.getDay()]
      });
      current.setDate(current.getDate() + 1);
    }

    const empMap = new Map<string, {
      emp_id: string;
      name: string;
      shift_class: string;
      is_driver: boolean;
      datesMap: Map<string, IntegratedRecord>;
    }>();

    integratedPunchData.forEach(row => {
      if (!empMap.has(row.emp_id)) {
        empMap.set(row.emp_id, {
          emp_id: row.emp_id,
          name: row.name,
          shift_class: row.shift_class,
          is_driver: row.is_driver,
          datesMap: new Map<string, IntegratedRecord>()
        });
      }
      empMap.get(row.emp_id)!.datesMap.set(row.punch_date, row);
    });

    const query = reportQuery.trim().toLowerCase();
    let employees = Array.from(empMap.values()).sort((a, b) => (a.emp_id || '').localeCompare(b.emp_id || ''));

    if (query) {
      employees = employees.filter(emp => 
        emp.name.toLowerCase().includes(query) || 
        emp.emp_id.toLowerCase().includes(query) ||
        emp.shift_class.toLowerCase().includes(query)
      );
    }

    return {
      dates: fullDateList,
      employees
    };
  };

  // ==========================================
  // Exports to Excel (SheetJS)
  // ==========================================
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const filenameDate = new Date().toISOString().substring(0, 10);

      if (reportType === 'night') {
        const data = getNightMealList();
        if (data.length === 0) {
          alert('無資料可供匯出！');
          return;
        }
        
        // Define rows and enforce everything as raw string cells to prevent Excel date auto-conversions
        const header = ['員工卡號', '姓名', '班別', '身分屬性', '符合次數', '打卡符合日期明細 (日)'];
        const rows = [header];
        
        data.forEach(row => {
          rows.push([
            row.emp_id,
            row.name,
            row.shift_class,
            row.is_driver ? '司機' : '一般員工',
            `${row.count} 次`,
            row.dates.sort().join(', ')
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 40 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, '夜點津貼彙整表');
        XLSX.writeFile(wb, `夜點津貼彙整表_${filenameDate}.xlsx`);

      } else if (reportType === 'daily') {
        const data = getDailyPunchList();
        if (data.length === 0) {
          alert('無資料可供匯出！');
          return;
        }

        const header = ['班別', '員工卡號', '姓名', '身分屬性', '打卡次數', '打卡時間戳記明細'];
        const rows = [header];

        data.forEach(row => {
          rows.push([
            row.shift_class,
            row.emp_id,
            row.name,
            row.is_driver ? '司機' : '一般員工',
            `${row.punch_times.length} 次`,
            row.punch_times.join(', ')
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 40 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, '單日打卡查詢');
        XLSX.writeFile(wb, `單日打卡查詢_${selectedDate || availableDates[0]}_${filenameDate}.xlsx`);
      } else {
        alert('此報表類型不支援 Excel 匯出！');
      }
    } catch (err: any) {
      alert('匯出 Excel 發生錯誤：' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 報表選擇面板 */}
      <div className="glass-panel p-6 no-print">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <LineChart className="w-6 h-6 text-indigo-400" />
          薪資與考勤報表生成區
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          點選下方按鈕，系統將即時生成您的考勤統計報表，並支援快速過濾、下載或列印。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button 
            onClick={() => { setReportType('night'); setReportQuery(''); }}
            disabled={!isETLReady}
            className="btn-outline-premium py-4 flex flex-col items-center gap-2 border-slate-800 hover:border-indigo-500/50 bg-slate-950/20 hover:bg-slate-900/50 text-slate-200"
          >
            <Moon className="w-6 h-6 text-indigo-400" />
            <span className="font-semibold text-sm">夜點津貼彙整表</span>
          </button>
          <button 
            onClick={() => { setReportType('daily'); setReportQuery(''); }}
            disabled={!isETLReady}
            className="btn-outline-premium py-4 flex flex-col items-center gap-2 border-slate-800 hover:border-indigo-500/50 bg-slate-950/20 hover:bg-slate-900/50 text-slate-200"
          >
            <Calendar className="w-6 h-6 text-violet-400" />
            <span className="font-semibold text-sm">單日打卡查詢</span>
          </button>
          <button 
            onClick={() => { setReportType('full'); setReportQuery(''); }}
            disabled={!isETLReady}
            className="btn-outline-premium py-4 flex flex-col items-center gap-2 border-slate-800 hover:border-indigo-500/50 bg-slate-950/20 hover:bg-slate-900/50 text-slate-200"
          >
            <FileText className="w-6 h-6 text-sky-400" />
            <span className="font-semibold text-sm">打卡紀錄完整查詢</span>
          </button>
        </div>
      </div>

      {/* 待命狀態佔位卡片 */}
      {reportType === 'none' && (
        <div className="glass-panel text-center py-14 bg-slate-900/20 border-dashed border-slate-800/80">
          <LineChart className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-400">等待生成報表</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
            請先在上傳頁面完成 ETL 整合，再點選上方報表按鈕開始進行考勤薪資查詢。
          </p>
        </div>
      )}

      {/* 報表渲染展示區 */}
      {reportType !== 'none' && (
        <div className="glass-panel p-6">
          {/* 報表頂部工具列 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-slate-800/60 no-print">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              {reportType === 'night' && '夜點津貼彙整表'}
              {reportType === 'daily' && '單日打卡查詢報表'}
              {reportType === 'full' && '考勤月打卡紀錄完整查詢'}
            </h3>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {/* 即時搜尋框 */}
              {reportType !== 'daily' && (
                <div className="relative w-44">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <Search className="w-3.5 h-3.5 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    value={reportQuery}
                    onChange={(e) => setReportQuery(e.target.value)}
                    placeholder="搜尋姓名或編號..."
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-[11px] focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              )}

              <button 
                onClick={() => window.print()}
                className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                title="列印報表"
              >
                <Printer className="w-3.5 h-3.5" />
                列印
              </button>
              
              {reportType !== 'full' && (
                <button 
                  onClick={handleExportExcel}
                  className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                  title="下載 Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  Excel
                </button>
              )}

              <button 
                onClick={handleCloseReport}
                className="p-2 border border-slate-850 hover:bg-rose-950/30 text-slate-500 hover:text-rose-400 rounded-lg text-xs flex items-center gap-1 transition-colors"
                title="關閉報表"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ==========================================
              A. 夜點津貼彙整表 內容
             ========================================== */}
          {reportType === 'night' && (() => {
            const data = getNightMealList();
            const allData = getNightMealList(true);
            const totalAllowance = data.reduce((sum, item) => sum + item.count, 0);
            const nightShifts = getNightShifts();

            return (
              <div className="space-y-6">
                <div className="page-header text-center mb-6 py-2 border-b border-slate-900 hidden print:block">
                  <h2 className="text-xl font-bold text-black">夜點津貼彙整表</h2>
                  <div className="text-[10px] text-gray-500 mt-1">夜點時間門檻: {threshold} 以後 | 生成時間: {new Date().toLocaleString()}</div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-4 no-print">
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">符合領取資格人數</span>
                    <div className="text-2xl font-bold text-white mt-1">{data.length} <span className="text-xs text-slate-500">人</span></div>
                  </div>
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">夜點津貼發放總人次</span>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">{totalAllowance} <span className="text-xs text-slate-500">次</span></div>
                  </div>
                </div>

                {/* Night Meal Shift Filters */}
                {nightShifts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-3 bg-slate-950/40 border border-slate-850 rounded-xl no-print">
                    <span className="text-xs text-slate-500 font-bold me-1.5 flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5 text-indigo-400" />
                      班別快速篩選：
                    </span>
                    <button
                      onClick={() => setNightShiftFilter('all')}
                      className={cn(
                        "px-2.5 py-1 text-[11px] rounded-lg transition-colors font-semibold",
                        nightShiftFilter === 'all' ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
                      )}
                    >
                      全部 ({data.length}人)
                    </button>
                    {nightShifts.map(shift => {
                      const count = allData.filter(item => item.shift_class === shift).length;
                      return (
                        <button
                          key={shift}
                          onClick={() => setNightShiftFilter(shift)}
                          className={cn(
                            "px-2.5 py-1 text-[11px] rounded-lg transition-colors font-semibold",
                            nightShiftFilter === shift ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
                          )}
                        >
                          {shift} ({count}人)
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto border border-slate-850 bg-slate-950/20 rounded-xl">
                  <table className="w-full text-left border-collapse text-sm" id="rendered-report-table">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold text-center text-sm md:text-[15px]">
                        <th className="p-3 text-left min-w-[6rem] whitespace-nowrap">員工卡號</th>
                        <th className="p-3 text-left min-w-[6rem] whitespace-nowrap">姓名</th>
                        <th className="p-3 text-left min-w-[6rem] whitespace-nowrap">班別</th>
                        <th className="p-3 text-left min-w-[6rem] whitespace-nowrap">身分屬性</th>
                        <th className="p-3 text-center min-w-[6rem] whitespace-nowrap">符合次數</th>
                        <th className="p-3 text-left w-full">打卡符合日期明細 (日)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-500">本期無任何符合夜點津貼條件的記錄。</td>
                        </tr>
                      ) : (
                        data.map((row, idx) => (
                          <tr
                            key={row.emp_id}
                            className={cn(
                              "border-b border-slate-900 hover:bg-slate-900/30 text-slate-300 transition-colors",
                              idx % 2 === 1 ? "bg-slate-900/40" : "bg-transparent"
                            )}
                          >
                            <td className="p-3 font-mono text-[15px] font-bold text-white/90 whitespace-nowrap">{row.emp_id}</td>
                            <td className="p-3 font-semibold text-[15px] text-white whitespace-nowrap">{row.name}</td>
                            <td className="p-3 text-[15px] text-slate-300 whitespace-nowrap">{row.shift_class}</td>
                            <td className="p-3 text-[15px] whitespace-nowrap">
                              {row.is_driver ? (
                                <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold rounded-lg text-xs">司機</span>
                              ) : (
                                <span className="text-slate-500">一般員工</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-bold text-[15px] text-emerald-400 whitespace-nowrap">{row.count} 次</td>
                            <td className="p-3 break-all font-mono text-[15px] text-slate-300">{row.dates.sort().join(', ')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ==========================================
              B. 單日打卡查詢 內容
             ========================================== */}
          {reportType === 'daily' && (() => {
            const data = getDailyPunchList();
            const activeDate = selectedDate || availableDates[0];

            return (
              <div className="space-y-6">
                {/* Date Dropdowns controls */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950/40 p-4 border border-slate-850 rounded-xl no-print">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold">查詢日期：</span>
                    <select
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setReportQuery('');
                      }}
                      className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                    >
                      {availableDates.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold">即時搜尋：</span>
                    <input
                      type="text"
                      value={reportQuery}
                      onChange={(e) => setReportQuery(e.target.value)}
                      placeholder="搜尋姓名、編號或班別..."
                      className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-44"
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:ml-auto">
                    <input
                      type="checkbox"
                      id="check-print-layout"
                      checked={isPrintLayout}
                      onChange={(e) => setIsPrintLayout(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded bg-slate-950 border-slate-850"
                    />
                    <label htmlFor="check-print-layout" className="text-xs text-slate-300 font-semibold cursor-pointer">
                      雙欄列印排版
                    </label>
                  </div>
                </div>

                <div className="page-header text-center mb-6 py-2 border-b border-slate-900 hidden print:block">
                  <h2 className="text-xl font-bold text-black">單日打卡查詢報表</h2>
                  <div className="text-[10px] text-gray-500 mt-1">查詢日期: {activeDate} | 該日總打卡人次: {data.length} 人</div>
                </div>

                {isPrintLayout ? (
                  // Grouped Double Column Layout
                  <div className="print-layout-container space-y-6">
                    {getGroupedDailyData(data).map(([className, list]) => {
                      const mid = Math.ceil(list.length / 2);
                      const col1 = list.slice(0, mid);
                      const col2 = list.slice(mid);

                      const renderColTable = (items: IntegratedRecord[]) => (
                        <table className="w-full text-left border-collapse text-xs border border-slate-800 print:text-black">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-850 text-slate-300 font-bold print:bg-gray-200 print:text-black text-xs md:text-[13px]">
                              <th className="p-2 w-[40%]">姓名/卡號</th>
                              <th className="p-2 w-[15%] text-center">次數</th>
                              <th className="p-2 w-[45%]">打卡時間明細</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((emp, idx) => (
                              <tr 
                                key={emp.emp_id} 
                                className={cn(
                                  "border-b border-slate-900 print:border-gray-300 transition-colors",
                                  idx % 2 === 1 ? "bg-slate-900/40 text-slate-300" : "bg-transparent text-slate-350"
                                )}
                              >
                                <td className="p-2">
                                  <div className="font-bold text-white text-xs print:text-black">{emp.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono print:text-gray-600">{emp.emp_id} {emp.is_driver ? '[司機]' : ''}</div>
                                </td>
                                <td className="p-2 text-center font-bold text-xs">{emp.punch_times.length}</td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {emp.punch_times.map((t, idx) => (
                                      <span key={idx} className="font-mono bg-slate-950/60 text-slate-300 border border-slate-800/80 px-1 rounded text-xs print:bg-white print:text-black print:border-gray-300">
                                        {t.substring(0, 5)}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );

                      return (
                        <div key={className} className="page-break border border-slate-850 p-4 rounded-xl bg-slate-900/20 print:border-gray-400">
                          <h4 className="font-bold text-sm text-indigo-400 mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-2 print:text-black print:border-gray-300">
                            班別: {className} (共 {list.length} 人)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>{renderColTable(col1)}</div>
                            <div>{col2.length > 0 ? renderColTable(col2) : <div className="text-slate-600 text-xs italic p-4 text-center">無更多人員</div>}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Regular Table Layout
                  <div className="overflow-x-auto border border-slate-850 bg-slate-950/20 rounded-xl">
                    <table className="w-full text-left border-collapse text-sm" id="rendered-report-table">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold text-center text-sm md:text-[15px]">
                          <th className="p-3 text-left w-28">班別</th>
                          <th className="p-3 text-left">員工卡號</th>
                          <th className="p-3 text-left w-28">姓名</th>
                          <th className="p-3 text-left">身分</th>
                          <th className="p-3 text-center">打卡次數</th>
                          <th className="p-3 text-left">打卡時間戳記明細 (按順序排列)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-500">該日期無打卡資料。</td>
                          </tr>
                        ) : (
                          data.map((row, idx) => (
                            <tr 
                              key={row.emp_id} 
                              className={cn(
                                "border-b border-slate-900 hover:bg-slate-900/30 text-slate-300 transition-colors",
                                idx % 2 === 1 ? "bg-slate-900/40" : "bg-transparent"
                              )}
                            >
                              <td className="p-3 font-semibold text-[15px] text-white truncate max-w-[7rem]">{row.shift_class}</td>
                              <td className="p-3 font-mono text-[15px] text-white/90">{row.emp_id}</td>
                              <td className="p-3 font-semibold text-[15px] text-white truncate max-w-[7rem]">{row.name}</td>
                              <td className="p-3 text-[15px]">
                                {row.is_driver ? (
                                  <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold rounded-lg text-xs">司機</span>
                                ) : (
                                  <span className="text-slate-500">一般</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-bold text-[15px]">{row.punch_times.length} 次</td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {row.punch_times.map((t, idx) => {
                                    const isOdd = (idx + 1) % 2 === 1;
                                    return (
                                      <span 
                                        key={idx} 
                                        className={cn(
                                          "px-2 py-0.5 rounded font-mono font-semibold text-xs border",
                                          isOdd 
                                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" 
                                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                        )}
                                      >
                                        {t}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ==========================================
              C. 打卡紀錄完整查詢 內容
             ========================================== */}
          {reportType === 'full' && (() => {
            const { dates, employees } = getFullPunchList();

            return (
              <div className="space-y-6">
                <div className="page-header text-center mb-6 py-2 border-b border-slate-900 hidden print:block">
                  <h2 className="text-xl font-bold text-black">考勤月打卡紀錄完整查詢</h2>
                  <div className="text-[10px] text-gray-500 mt-1">考勤天數共計 {dates.length} 天</div>
                </div>

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded-xl no-print">
                  💡 提示：本報表將為每位員工生成一個獨立的日曆考勤對照卡片，會自動補齊該月份的所有日期，空白表示該天無打卡紀錄。支援瀏覽器列印為 PDF。
                </div>

                {employees.length === 0 ? (
                  <div className="text-center text-slate-500 p-10">找不到相符的員工打卡完整記錄。</div>
                ) : (
                  employees.map((emp) => (
                    <div 
                      key={emp.emp_id} 
                      className="glass-panel p-5 bg-slate-900/40 border-slate-800/80 page-break"
                    >
                      <h4 className="text-sm font-bold text-indigo-400 pb-3 border-b border-slate-850 flex items-center justify-between mb-4 print:text-black print:border-gray-300">
                        <span>
                          [{emp.emp_id}] {emp.name} ({emp.shift_class || '未設定班別'})
                        </span>
                        {emp.is_driver && (
                          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg print:border-gray-400 print:text-black">
                            司機
                          </span>
                        )}
                      </h4>

                      <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-950/20 print:border-gray-300">
                        <table className="w-full text-left border-collapse text-sm print:text-black">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800 text-slate-350 font-bold text-center text-sm md:text-[15px] print:bg-gray-150 print:text-black">
                              <th className="p-2 w-[20%]">日期</th>
                              <th className="p-2 w-[10%]">星期</th>
                              <th className="p-2 w-[20%]">打卡狀態</th>
                              <th className="p-2 w-[15%]">打卡次數</th>
                              <th className="p-2 w-[35%] text-left">詳細時間點</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dates.map((day, dayIdx) => {
                              const punchRecord = emp.datesMap.get(day.date);
                              const count = punchRecord ? punchRecord.punch_times.length : 0;
                              const isWeekend = day.weekday === '六' || day.weekday === '日';

                              return (
                                <tr 
                                  key={day.date} 
                                  className={cn(
                                    "border-b border-slate-900 text-center hover:bg-slate-900/10 print:border-gray-200 transition-colors",
                                    isWeekend 
                                      ? "bg-amber-500/[0.02] text-amber-300 print:bg-gray-50 print:text-black" 
                                      : (dayIdx % 2 === 1 
                                          ? "bg-slate-900/40 text-slate-300" 
                                          : "bg-transparent text-slate-350")
                                  )}
                                >
                                  <td className="p-2 font-mono text-[15px] font-bold text-white/90">{day.date}</td>
                                  <td className="p-2 font-bold text-[15px] text-white">{day.weekday}</td>
                                  <td className="p-2 font-extrabold text-[15px]">
                                    {count > 0 ? (
                                      <span className="text-emerald-400 print:text-green-700">刷卡正常</span>
                                    ) : (
                                      <span className="text-rose-500/80 font-bold print:text-gray-400">未刷卡/缺勤</span>
                                    )}
                                  </td>
                                  <td className="p-2 font-extrabold text-[15px] text-white">{count > 0 ? `${count} 次` : '-'}</td>
                                  <td className="p-2 text-left">
                                    <div className="flex flex-wrap gap-1">
                                      {punchRecord && punchRecord.punch_times.map((t, idx) => {
                                        const isOdd = (idx + 1) % 2 === 1;
                                        return (
                                          <span 
                                            key={idx} 
                                            className={cn(
                                              "px-2 py-0.5 rounded font-mono font-bold text-xs border transition-colors",
                                              isOdd 
                                                ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 print:bg-white print:border-gray-300 print:text-black"
                                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 print:bg-white print:border-gray-300 print:text-black"
                                            )}
                                          >
                                            {t}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
