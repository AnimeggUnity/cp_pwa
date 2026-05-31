import React, { useState } from 'react';
import { usePunchStore } from '../store/usePunchStore';
import { 
  Search, 
  RefreshCw, 
  FileSpreadsheet, 
  Printer, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import type { IntegratedRecord } from '../types';

export const FullMachineMatch: React.FC = () => {
  const integratedPunchData = usePunchStore((state) => state.integratedPunchData);
  const availableDates = usePunchStore((state) => state.availableDates);
  const machineList = usePunchStore((state) => state.machineList);
  const isETLReady = integratedPunchData.length > 0;
  const addLog = usePunchStore((state) => state.addLog);

  // States
  const [isReportActive, setIsReportActive] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);

  // Map of machine configurations for quick checks
  const machineMap = React.useMemo(() => {
    const map = new Map<string, { location: string; isShared: boolean; allowed: Set<string>; shift_class: string }>();
    machineList.forEach(m => {
      map.set(m.machine_id, {
        location: m.location || '-',
        shift_class: m.shift_class,
        isShared: m.shift_class === '共用',
        allowed: new Set(m.shift_class.split(',').map(s => s.trim()))
      });
    });
    return map;
  }, [machineList]);

  // Supplement full dates from min to max date
  const fullDateList = React.useMemo(() => {
    if (availableDates.length === 0) return [];
    const sorted = [...availableDates].sort();
    const minDate = new Date(sorted[0]);
    const maxDate = new Date(sorted[sorted.length - 1]);
    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
    
    const dates: { date: string; displayDate: string; weekday: string }[] = [];
    let cur = new Date(minDate);
    while (cur <= maxDate) {
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      dates.push({
        date: `${yyyy}-${mm}-${dd}`,
        displayDate: `${mm}-${dd}`,
        weekday: weekdayNames[cur.getDay()]
      });
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [availableDates]);

  // Helper: check machine anomalies in record
  const getAnomalyLocations = (row: IntegratedRecord) => {
    if (machineList.length === 0) return [];
    if (!row.shift_class || row.shift_class === '未設定班別') return [];
    const anomalies: { time: string; location: string; isUnknown: boolean }[] = [];

    (row.punch_records || []).forEach(punch => {
      if (!punch.machine_id) return;
      const machine = machineMap.get(punch.machine_id);
      if (!machine) {
        const rawLoc = punch.location ? `${punch.machine_id} ${punch.location}` : `未登記 (${punch.machine_id})`;
        anomalies.push({ time: punch.time, location: rawLoc, isUnknown: true });
        return;
      }
      if (machine.isShared) return;
      if (!machine.allowed.has(row.shift_class)) {
        anomalies.push({ time: punch.time, location: machine.location, isUnknown: false });
      }
    });
    return anomalies;
  };

  // Helper: check if employee has any anomalies
  const empHasAnomaly = (emp: any) => {
    for (const date of fullDateList) {
      const row = emp.datesMap.get(date.date);
      if (row && getAnomalyLocations(row).length > 0) return true;
    }
    return false;
  };

  // Helper: count total anomalies in a list of employees
  const countAnomaliesInList = (list: any[]) => {
    let count = 0;
    list.forEach(emp => {
      fullDateList.forEach(date => {
        const row = emp.datesMap.get(date.date);
        if (row) {
          count += getAnomalyLocations(row).length;
        }
      });
    });
    return count;
  };

  // Formulate employee maps & lists
  const employees = React.useMemo(() => {
    if (!isReportActive) return [];

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
          shift_class: row.shift_class || '未設定班別',
          is_driver: row.is_driver,
          datesMap: new Map<string, IntegratedRecord>()
        });
      }
      empMap.get(row.emp_id)!.datesMap.set(row.punch_date, row);
    });

    return Array.from(empMap.values()).sort((a, b) => (a.emp_id || '').localeCompare(b.emp_id || ''));
  }, [integratedPunchData, isReportActive]);

  // Unique shifts for filters
  const allShifts = React.useMemo(() => {
    return Array.from(new Set(employees.map(e => e.shift_class))).sort();
  }, [employees]);

  // Filters calculations
  const filteredEmployees = React.useMemo(() => {
    let result = shiftFilter === 'all'
      ? employees
      : employees.filter(e => e.shift_class === shiftFilter);

    if (onlyAnomaly && machineList.length > 0) {
      result = result.filter(emp => empHasAnomaly(emp));
    }
    return result;
  }, [employees, shiftFilter, onlyAnomaly, machineList, fullDateList]);

  // Pagination bounds
  const totalEmployees = filteredEmployees.length;
  const totalPages = Math.ceil(totalEmployees / pageSize);
  const activePage = currentPage > totalPages ? Math.max(1, totalPages) : currentPage;
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEmployees);
  const currentPageData = filteredEmployees.slice(startIndex, endIndex);

  const handleGenerateReport = () => {
    if (!isETLReady) return;
    setIsReportActive(true);
    setCurrentPage(1);
    setShiftFilter('all');
    setOnlyAnomaly(false);
    addLog('生成完整打卡 + 機號比對報表...', 'info');
  };

  const handleExportExcel = () => {
    if (employees.length === 0) {
      alert('請先生成報表！');
      return;
    }

    const showAnomalyCol = machineList.length > 0;
    const header = ['卡號', '姓名', '班別', '日期', '星期', '打卡次數', '詳細時間點'];
    if (showAnomalyCol) header.push('異常位置對照');

    const rows: any[][] = [header];
    const anomalyRows: any[][] = [['卡號', '姓名', '班別', '日期', '星期', '異常打卡時間', '異常打卡機位置', '異常類型']];
    
    // Export based on active shift filter
    const activeList = shiftFilter === 'all'
      ? employees
      : employees.filter(e => e.shift_class === shiftFilter);

    activeList.forEach(emp => {
      fullDateList.forEach(day => {
        const punchRecord = emp.datesMap.get(day.date);
        const count = punchRecord ? punchRecord.punch_times.length : 0;
        const timesStr = count > 0 ? punchRecord.punch_times.join(' ') : '';

        const row = [
          emp.emp_id,
          emp.name,
          emp.shift_class,
          day.date,
          day.weekday,
          count,
          timesStr
        ];

        if (showAnomalyCol) {
          const anomalies = punchRecord ? getAnomalyLocations(punchRecord) : [];
          row.push(anomalies.map(a => `${a.time} → ${a.location}`).join('; '));

          // Collect each anomalous punch point individually for structured auditing
          anomalies.forEach(a => {
            anomalyRows.push([
              emp.emp_id,
              emp.name,
              emp.shift_class,
              day.date,
              day.weekday,
              a.time,
              a.location,
              a.isUnknown ? '未登記機台' : '跨班刷卡'
            ]);
          });
        }

        rows.push(row);
      });
    });

    try {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 5 },
        { wch: 8 }, { wch: 30 }, { wch: 30 }
      ];
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '完整打卡紀錄');

      // Append anomalous details sheet if there is any anomaly
      if (showAnomalyCol && anomalyRows.length > 1) {
        const wsAnomaly = XLSX.utils.aoa_to_sheet(anomalyRows);
        wsAnomaly['!cols'] = [
          { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 5 },
          { wch: 15 }, { wch: 35 }
        ];
        XLSX.utils.book_append_sheet(wb, wsAnomaly, '異常打卡明細');
      }

      XLSX.writeFile(wb, `完整打卡紀錄_${new Date().toISOString().substring(0, 10)}.xlsx`);
      addLog('完整打卡報表匯出 Excel 成功（含異常打卡獨立分頁）！', 'success');
    } catch (err: any) {
      addLog(`匯出 Excel 失敗: ${err.message}`, 'error');
      alert('匯出失敗！');
    }
  };

  // Anomaly stats
  const totalAnomalies = React.useMemo(() => {
    return machineList.length > 0 ? countAnomaliesInList(employees) : 0;
  }, [employees, machineList, fullDateList]);

  const filteredAnomalies = React.useMemo(() => {
    const list = shiftFilter === 'all' ? employees : employees.filter(e => e.shift_class === shiftFilter);
    return machineList.length > 0 ? countAnomaliesInList(list) : 0;
  }, [employees, shiftFilter, machineList, fullDateList]);

  return (
    <div className="space-y-6">
      {/* Control Actions Header */}
      <div className="glass-panel p-6 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-6 h-6 text-indigo-400" />
              完整打卡紀錄 + 機號比對
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              逐筆比對每次打卡的機台是否符合員工班別，異常打卡標示所在位置。若未設定機號資料庫，僅顯示打卡時間。
            </p>
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={!isETLReady}
            className="btn-premium flex items-center gap-1.5 self-start sm:self-auto text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            生成報表
          </button>
        </div>
      </div>

      {/* Waiting Placeholder */}
      {!isReportActive && (
        <div className="glass-panel text-center py-14 bg-slate-900/20 border-dashed border-slate-800/80 no-print">
          <Search className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-400">等待生成報表</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
            請先完成 ETL 整合，再點選「生成報表」。<br />若已設定機號資料庫則同步比對異常位置。
          </p>
        </div>
      )}

      {/* Report results list */}
      {isReportActive && (
        <div className="space-y-6">
          {/* Main Table Preview Header card */}
          <div className="glass-panel p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/60 mb-4 no-print">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-base">完整打卡紀錄</span>
                <span className="px-2.5 py-0.5 bg-slate-950/60 border border-slate-850 text-indigo-400 text-xs font-bold rounded-lg">
                  {onlyAnomaly ? `${totalEmployees} 人有異常` : `${totalEmployees} 人`}
                </span>
                
                {filteredAnomalies > 0 && (
                  <button
                    onClick={() => {
                      setOnlyAnomaly(!onlyAnomaly);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      "px-2.5 py-0.5 border text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors",
                      onlyAnomaly 
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20" 
                        : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                    )}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {onlyAnomaly ? `${filteredAnomalies} 筆異常（點擊取消篩選）` : `${filteredAnomalies} 筆異常`}
                  </button>
                )}
              </div>

              {/* Page controls */}
              <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto text-xs">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span>每頁</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value, 10));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-slate-350 focus:outline-none"
                  >
                    <option value={10}>10 人</option>
                    <option value={20}>20 人</option>
                    <option value={50}>50 人</option>
                  </select>
                </div>
                <button 
                  onClick={handleExportExcel}
                  className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  匯出 Excel
                </button>
                <button 
                  onClick={() => window.print()}
                  className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                >
                  <Printer className="w-3.5 h-3.5" />
                  列印
                </button>
              </div>
            </div>

            {/* Dynamic shifts filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mb-6 p-3 bg-slate-950/40 border border-slate-850 rounded-xl no-print">
              <span className="text-xs text-slate-500 font-bold me-1.5 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                班別篩選：
              </span>
              <button
                onClick={() => { setShiftFilter('all'); setOnlyAnomaly(false); setCurrentPage(1); }}
                className={cn(
                  "px-2.5 py-1 text-sm rounded-lg transition-colors font-semibold flex items-center gap-1",
                  shiftFilter === 'all' ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
                )}
              >
                全部 ({employees.length}人)
                {totalAnomalies > 0 && <span className="px-1.5 py-0.2 bg-red-600 text-white text-[11px] font-bold rounded-full ml-1">{totalAnomalies}</span>}
              </button>
              {allShifts.map(shift => {
                const shiftEmps = employees.filter(e => e.shift_class === shift);
                const shiftAnomalyCount = machineList.length > 0 ? countAnomaliesInList(shiftEmps) : 0;
                return (
                  <button
                    key={shift}
                    onClick={() => { setShiftFilter(shift); setOnlyAnomaly(false); setCurrentPage(1); }}
                    className={cn(
                      "px-2.5 py-1 text-sm rounded-lg transition-colors font-semibold flex items-center gap-1",
                      shiftFilter === shift ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
                    )}
                  >
                    {shift} ({shiftEmps.length}人)
                    {shiftAnomalyCount > 0 && <span className="px-1.5 py-0.2 bg-red-600 text-white text-[11px] font-bold rounded-full ml-1">{shiftAnomalyCount}</span>}
                  </button>
                );
              })}
            </div>

            {/* Print Header */}
            <div className="page-header text-center mb-6 py-2 border-b border-slate-900 hidden print:block">
              <h2 className="text-xl font-bold text-black">完整打卡紀錄 + 機號比對報表</h2>
              <div className="text-xs text-gray-500 mt-1">報表區間: {fullDateList[0]?.date} ~ {fullDateList[fullDateList.length - 1]?.date}</div>
            </div>

            {/* Cards container */}
            <div className="space-y-6">
              {currentPageData.length === 0 ? (
                <div className="text-center text-slate-500 py-10">此篩選條件下無符合資料。</div>
              ) : (
                currentPageData.map((emp) => {
                  let empAnomalyCount = 0;
                  const datesToRender = fullDateList.filter(day => {
                    if (!onlyAnomaly) return true;
                    const punchRecord = emp.datesMap.get(day.date);
                    return punchRecord && getAnomalyLocations(punchRecord).length > 0;
                  });

                  return (
                    <div 
                      key={emp.emp_id} 
                      className="border border-slate-850 rounded-xl p-4 bg-slate-950/20 shadow-md page-break"
                    >
                      <h4 className="text-sm font-bold text-indigo-400 border-b border-slate-850 pb-2 flex items-center justify-between mb-3 print:text-black print:border-gray-300">
                        <span className="flex items-center gap-1.5">
                          [{emp.emp_id}] {emp.name} ({emp.shift_class})
                          {emp.is_driver && <span className="px-1.5 py-0.2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold rounded-lg">司機</span>}
                        </span>
                        
                        {/* Employee Anomaly Indicator */}
                        {(() => {
                          let totalEmpAnom = 0;
                          emp.datesMap.forEach(row => {
                            totalEmpAnom += getAnomalyLocations(row).length;
                          });
                          if (totalEmpAnom > 0) {
                            return (
                              <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-lg print:border-gray-400 print:text-black">
                                {totalEmpAnom} 筆異常
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </h4>

                      <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-950/20 print:border-gray-300">
                        <table className="w-full text-left border-collapse text-sm print:text-black">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold text-center text-sm md:text-base print:bg-gray-150 print:text-black">
                              <th className="py-3 px-1.5 w-[13%]">日期</th>
                              <th className="py-3 px-1.5 w-[6%]">星期</th>
                              <th className="py-3 px-1.5 w-[11%]">打卡狀態</th>
                              <th className="py-3 px-1.5 w-[9%]">打卡次數</th>
                              <th className="py-3 px-3 w-[36%] text-left">詳細時間點</th>
                              {machineList.length > 0 && <th className="py-3 px-3 text-left w-[25%]">異常位置</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {datesToRender.map((day, dayIdx) => {
                              const punchRecord = emp.datesMap.get(day.date);
                              const count = punchRecord ? punchRecord.punch_times.length : 0;
                              const isWeekend = day.weekday === '六' || day.weekday === '日';
                              const anomalies = punchRecord ? getAnomalyLocations(punchRecord) : [];
                              empAnomalyCount += anomalies.length;

                              return (
                                <tr 
                                  key={day.date} 
                                  className={cn(
                                    "border-b border-slate-900/60 text-center hover:bg-slate-900/30 print:border-gray-250 transition-colors",
                                    isWeekend 
                                      ? "bg-amber-500/[0.02] text-amber-300 print:bg-gray-50 print:text-black" 
                                      : (dayIdx % 2 === 1 
                                          ? "bg-slate-900/40 text-slate-300" 
                                          : "bg-transparent text-slate-350")
                                  )}
                                >
                                  <td className="py-3 px-1.5 font-mono text-base font-bold text-white/90">{day.date}</td>
                                  <td className="py-3 px-1.5 font-bold text-base text-white">{day.weekday}</td>
                                  <td className="py-3 px-1.5 font-extrabold text-base">
                                    {count > 0 ? (
                                      <span className="text-emerald-400 print:text-green-700">正常</span>
                                    ) : (
                                      <span className="text-rose-500/80 font-bold print:text-gray-400">未刷卡</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-1.5 font-extrabold text-base text-white">{count > 0 ? `${count} 次` : '-'}</td>
                                  <td className="p-2 text-left">
                                    <div className="flex flex-wrap gap-1">
                                      {punchRecord && punchRecord.punch_times.map((t, idx) => {
                                        const isOdd = (idx + 1) % 2 === 1;
                                        const matchedAnomaly = anomalies.find(anom => anom.time === t);
                                        return (
                                          <span
                                            key={idx}
                                            className={cn(
                                              "px-2 py-0.5 rounded font-mono font-bold text-xs border transition-colors",
                                              matchedAnomaly?.isUnknown
                                                ? "bg-orange-500/15 border-orange-500/30 text-orange-400 font-extrabold shadow-sm print:bg-orange-50 print:border-orange-300 print:text-orange-800"
                                                : matchedAnomaly
                                                  ? "bg-rose-500/15 border-rose-500/30 text-rose-400 font-extrabold shadow-sm shadow-rose-950/20 print:bg-rose-50 print:border-red-300 print:text-red-700"
                                                  : (isOdd
                                                      ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 print:bg-white print:border-gray-300 print:text-black"
                                                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 print:bg-white print:border-gray-300 print:text-black")
                                            )}
                                          >
                                            {t}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  {machineList.length > 0 && (
                                    <td className="p-2 text-left">
                                      {anomalies.length > 0 ? (
                                        <div className="space-y-1">
                                          {anomalies.map((anom, idx) => (
                                            <div
                                              key={idx}
                                              className={cn(
                                                "font-semibold text-xs flex items-center gap-1.5",
                                                anom.isUnknown
                                                  ? "text-orange-400 print:text-orange-700"
                                                  : "text-rose-400 print:text-red-600"
                                              )}
                                            >
                                              <span className={cn(
                                                "w-1 h-1 rounded-full animate-ping",
                                                anom.isUnknown ? "bg-orange-500" : "bg-rose-500"
                                              )}></span>
                                              {anom.time} → {anom.location}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-650">-</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-6 pt-4 no-print border-t border-slate-900/60">
                <span className="text-xs md:text-sm text-slate-400 font-medium">
                  顯示第 <strong className="text-slate-200">{startIndex + 1}</strong> - <strong className="text-slate-200">{endIndex}</strong> 筆，共 <strong className="text-indigo-400">{totalEmployees}</strong> 筆
                </span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={activePage === 1}
                    className="p-2 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-850 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                    if (totalPages > 7 && Math.abs(p - activePage) > 2 && p !== 1 && p !== totalPages) {
                      if (p === 2 || p === totalPages - 1) return <span key={p} className="text-slate-600 px-2 font-mono text-xs">...</span>;
                      return null;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          "px-3.5 py-1.5 text-xs md:text-sm rounded-xl font-mono font-bold transition-all duration-150",
                          activePage === p 
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40 scale-105" 
                            : "hover:bg-slate-850 text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button 
                    onClick={() => setCurrentPage(next => Math.min(totalPages, next + 1))}
                    disabled={activePage === totalPages}
                    className="p-2 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-850 disabled:opacity-30 disabled:pointer-events-none transition-all duration-200"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
