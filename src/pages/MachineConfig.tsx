import React, { useState, useRef } from 'react';
import { usePunchStore } from '../store/usePunchStore';
import { 
  Network, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  FileText, 
  Search, 
  Edit3, 
  Trash, 
  X,
  Play,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Machine, MachineAnomalyRecord, NoShiftPunchRecord } from '../types';
import * as XLSX from 'xlsx';

export const MachineConfig: React.FC = () => {
  const machineList = usePunchStore((state) => state.machineList);
  const addMachine = usePunchStore((state) => state.addMachine);
  const updateMachine = usePunchStore((state) => state.updateMachine);
  const deleteMachine = usePunchStore((state) => state.deleteMachine);
  const clearMachineDatabase = usePunchStore((state) => state.clearMachineDatabase);
  const importMachineTSV = usePunchStore((state) => state.importMachineTSV);
  const saveMachineList = usePunchStore((state) => state.saveMachineList);
  const isETLReady = usePunchStore((state) => state.integratedPunchData.length > 0);
  const generateMachineAnomalyReport = usePunchStore((state) => state.generateMachineAnomalyReport);
  
  const lastAnomalyData = usePunchStore((state) => state.lastAnomalyData);
  const lastNoShiftData = usePunchStore((state) => state.lastNoShiftData);
  const addLog = usePunchStore((state) => state.addLog);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [tsvText, setTsvText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [isReportActive, setIsReportActive] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    machine_id: '',
    location: '',
    shift_class: ''
  });

  // Database Stats
  const totalCount = machineList.length;
  const sharedCount = machineList.filter(m => m.shift_class === '共用').length;
  const shiftOnlyCount = new Set(
    machineList.flatMap(m => m.shift_class.split(',').map(s => s.trim()).filter(s => s && s !== '共用'))
  ).size;

  const safeMachineList = Array.isArray(machineList) ? machineList.filter(Boolean) : [];

  // Filter & Search Logic
  const query = searchQuery.trim().toLowerCase();
  const textFiltered = safeMachineList.filter(m => {
    const machineId = m.machine_id ? String(m.machine_id).toLowerCase() : '';
    const location = m.location ? String(m.location).toLowerCase() : '';
    const shiftClass = m.shift_class ? String(m.shift_class).toLowerCase() : '';
    
    return machineId.includes(query) ||
           location.includes(query) ||
           shiftClass.includes(query);
  });

  const allShifts = Array.from(new Set(
    textFiltered.flatMap(m => (m.shift_class || '').split(',').map(s => s.trim()).filter(Boolean))
  )).sort();

  const filtered = shiftFilter === 'all'
    ? textFiltered
    : textFiltered.filter(m => (m.shift_class || '').split(',').map(s => s.trim()).includes(shiftFilter));

  const handleImportTSV = () => {
    if (!tsvText.trim()) {
      alert('請先貼上資料！');
      return;
    }
    const res = importMachineTSV(tsvText);
    if (res.success) {
      alert(res.message);
      setTsvText('');
    } else {
      alert('匯入失敗：' + res.message);
    }
  };

  const handleClearDatabase = () => {
    if (machineList.length === 0) return;
    if (window.confirm(`確定要清空全部 ${machineList.length} 筆機台資料嗎？此操作無法復原。`)) {
      clearMachineDatabase();
    }
  };

  const handleBackupExport = () => {
    if (machineList.length === 0) {
      alert('機台資料庫是空的！');
      return;
    }
    try {
      const dataStr = JSON.stringify(machineList, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `機號資料庫_${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('機號資料庫備份匯出成功。', 'success');
    } catch (err: any) {
      addLog(`備份失敗: ${err.message}`, 'error');
      alert('備份失敗！');
    }
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        if (!evt.target?.result) return;
        const text = evt.target.result as string;
        let data;
        try {
          data = JSON.parse(text);
        } catch (jsonErr: any) {
          throw new Error(`JSON 語法解析失敗（可能選錯了檔案，例如選到了 Excel 檔）：${jsonErr.message}`);
        }
        
        if (!Array.isArray(data)) throw new Error('還原檔案內容必須是 JSON 陣列格式（例如以 [ 開頭）。');
        const invalidItem = data.find(item => !item.machine_id || item.location === undefined);
        if (invalidItem) {
          throw new Error(`還原檔資料結構不正確。有些記錄缺少 [機號] 或 [實體位置]。例如這一筆：${JSON.stringify(invalidItem)}`);
        }
        await saveMachineList(data as Machine[]);
        addLog(`JSON 載入成功，共 ${data.length} 筆機台資料。`, 'success');
        alert(`還原備份成功，共載入 ${data.length} 筆機台資料！`);
      } catch (err: any) {
        alert(`還原失敗：${err.message}`);
        addLog(`JSON 載入失敗：${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openAddModal = () => {
    setModalMode('add');
    setFormData({
      machine_id: '',
      location: '',
      shift_class: ''
    });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (m: Machine) => {
    setModalMode('edit');
    setFormData({
      machine_id: m.machine_id,
      location: m.location,
      shift_class: m.shift_class
    });
    setEditingId(m.machine_id);
    setIsModalOpen(true);
  };

  const handleDeleteMachine = (id: string) => {
    if (window.confirm(`確定要刪除機台 [${id}] 嗎？`)) {
      deleteMachine(id);
    }
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    const { machine_id, location, shift_class } = formData;
    if (!machine_id.trim() || !shift_class.trim()) {
      alert('機號與班別為必填欄位！');
      return;
    }

    const machineObj: Machine = {
      machine_id: machine_id.trim(),
      location: location.trim(),
      shift_class: shift_class.trim()
    };

    if (modalMode === 'add') {
      const success = await addMachine(machineObj);
      if (!success) {
        alert(`機號 [${machine_id}] 已存在於資料庫中，不可重複！`);
        return;
      }
    } else {
      if (editingId) {
        const success = await updateMachine(editingId, machineObj);
        if (!success) {
          alert(`機號 [${machine_id}] 已存在於資料庫中，不可重複！`);
          return;
        }
      }
    }

    setIsModalOpen(false);
  };

  const handleRunComparison = () => {
    const res = generateMachineAnomalyReport();
    if (res.success) {
      setIsReportActive(true);
    }
  };

  // Grouped Anomaly calculations for rendering
  const getGroupedAnomalies = () => {
    const byEmployee = new Map<string, {
      emp_id: string;
      name: string;
      shift_class: string;
      byDate: Map<string, MachineAnomalyRecord[]>;
    }>();

    lastAnomalyData.forEach(a => {
      if (!byEmployee.has(a.emp_id)) {
        byEmployee.set(a.emp_id, {
          emp_id: a.emp_id,
          name: a.name,
          shift_class: a.shift_class,
          byDate: new Map<string, MachineAnomalyRecord[]>()
        });
      }
      const emp = byEmployee.get(a.emp_id)!;
      if (!emp.byDate.has(a.date)) {
        emp.byDate.set(a.date, []);
      }
      emp.byDate.get(a.date)!.push(a);
    });

    return Array.from(byEmployee.values())
      .sort((a, b) => (a.emp_id || '').localeCompare(b.emp_id || ''));
  };

  // Grouped No Shift punches
  const getGroupedNoShifts = () => {
    const byEmp = new Map<string, {
      key: string;
      emp_id: string;
      account_id: string;
      name: string;
      byDate: Map<string, NoShiftPunchRecord[]>;
    }>();

    lastNoShiftData.forEach(r => {
      if (!byEmp.has(r.key)) {
        byEmp.set(r.key, {
          key: r.key,
          emp_id: r.emp_id,
          account_id: r.account_id,
          name: r.name,
          byDate: new Map<string, NoShiftPunchRecord[]>()
        });
      }
      const emp = byEmp.get(r.key)!;
      if (!emp.byDate.has(r.date)) {
        emp.byDate.set(r.date, []);
      }
      emp.byDate.get(r.date)!.push(r);
    });

    return Array.from(byEmp.values())
      .sort((a, b) => (a.key || '').localeCompare(b.key || ''));
  };

  const handleExportAnomalyExcel = () => {
    if (lastAnomalyData.length === 0) return;
    const rows = [['卡號', '姓名', '班別', '日期', '打卡時間', '機號', '位置', '機台所屬班別']];
    lastAnomalyData.forEach(a => {
      rows.push([a.emp_id, a.name, a.shift_class, a.date, a.time, a.machine_id, a.machine_location, a.machine_allowed]);
    });
    try {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [10, 8, 10, 12, 10, 8, 18, 20].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '需確認打卡紀錄');
      XLSX.writeFile(wb, `需確認打卡紀錄_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (err: any) {
      alert('匯出 Excel 發生錯誤：' + err.message);
    }
  };

  const handleExportNoShiftExcel = () => {
    if (lastNoShiftData.length === 0) return;
    const rows = [['卡號', '姓名', '日期', '打卡時間', '機號', '位置']];
    lastNoShiftData.forEach(r => {
      rows.push([r.emp_id, r.name, r.date, r.time, r.machine_id, r.machine_location]);
    });
    try {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [10, 8, 12, 10, 8, 18].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '未設定班別人員');
      XLSX.writeFile(wb, `未設定班別人員打卡_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (err: any) {
      alert('匯出 Excel 發生錯誤：' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* DB Core actions and past tsv block */}
      <div className="glass-panel p-6 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-800/60">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Network className="w-6 h-6 text-indigo-400" />
            機號資料庫
          </h2>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button onClick={handleBackupExport} className="px-3 py-1.5 border border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs flex items-center gap-1.5 transition-colors bg-slate-950/40">
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              備份匯出 (JSON)
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 border border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs flex items-center gap-1.5 transition-colors bg-slate-950/40">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              還原匯入 (JSON)
            </button>
            <input type="file" ref={fileInputRef} onChange={handleBackupImport} accept=".json" className="hidden" />
            <button onClick={handleClearDatabase} className="px-3 py-1.5 border border-slate-850 hover:border-red-900/40 text-slate-400 hover:text-red-400 rounded-xl text-xs flex items-center gap-1.5 transition-colors bg-slate-950/40">
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              一鍵清空
            </button>
            <div className="w-px h-5 bg-slate-800 mx-1 hidden sm:block"></div>
            <button onClick={openAddModal} className="btn-premium flex items-center gap-1.5 text-xs py-1.5 px-3">
              <Plus className="w-3.5 h-3.5" />
              手動新增
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          從 Excel 複製後貼上，欄位順序：<code>機號</code>、<code>位置</code>、<code>班別</code>。班別填「共用」表示所有班別皆可刷此機台。<br />
          <span className="text-slate-500">支援分隔符：<strong className="text-slate-400">Tab</strong>（Excel 複製貼上）、<strong className="text-slate-400">逗號</strong>、<strong className="text-slate-400">兩個以上空格</strong>。單一空格不支援。</span>
        </p>

        {/* Text Area for Pasting */}
        <div className="space-y-3 mb-6">
          <textarea
            value={tsvText}
            onChange={(e) => setTsvText(e.target.value)}
            rows={2}
            placeholder="機號&#9;位置&#9;班別（從 Excel 複製後直接貼上）"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <button onClick={handleImportTSV} className="btn-outline-premium w-full flex items-center justify-center gap-2 py-2.5">
            <FileText className="w-4 h-4" />
            解析並匯入
          </button>
        </div>


      </div>

      {/* Database Viewer grid */}
      <div className="glass-panel p-6 no-print">
        {/* Statistics grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
            <div className="text-xl font-bold text-white font-mono">{totalCount}</div>
            <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">總機台數</span>
          </div>
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
            <div className="text-xl font-bold text-emerald-400 font-mono">{sharedCount}</div>
            <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">共用機台</span>
          </div>
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
            <div className="text-xl font-bold text-violet-400 font-mono">{shiftOnlyCount}</div>
            <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">已設定班別數</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800/60">
          <span className="font-bold text-white text-sm">已設定打卡機清冊</span>

          {/* Search box */}
          <div className="relative w-full md:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-500" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value) setShiftFilter('all');
              }}
              placeholder="搜尋機號、位置或班別..."
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Dynamic shifts filter row */}
        {allShifts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4 p-3 bg-slate-950/40 border border-slate-850 rounded-xl">
            <span className="text-xs text-slate-500 font-bold me-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
              班別篩選：
            </span>
            <button
              onClick={() => setShiftFilter('all')}
              className={cn(
                "px-2.5 py-1 text-sm rounded-lg transition-colors font-semibold",
                shiftFilter === 'all' ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
              )}
            >
              全部 ({textFiltered.length}台)
            </button>
            {allShifts.map(shift => {
              const count = textFiltered.filter(m => m.shift_class.split(',').map(s => s.trim()).includes(shift)).length;
              return (
                <button
                  key={shift}
                  onClick={() => setShiftFilter(shift)}
                  className={cn(
                    "px-2.5 py-1 text-sm rounded-lg transition-colors font-semibold",
                    shiftFilter === shift ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
                  )}
                >
                  {shift} ({count}台)
                </button>
              );
            })}
          </div>
        )}

        {/* Machine Table */}
        <div className="overflow-x-auto border border-slate-850 bg-slate-950/20 rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold text-sm md:text-base">
                <th className="p-3 text-left w-24">機號</th>
                <th className="p-3 text-left">實體位置</th>
                <th className="p-3 text-left">適用班別</th>
                <th className="p-3 w-20 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500">沒有符合的機台記錄。</td>
                </tr>
              ) : (
                filtered.map((m, idx) => {
                  const shifts = m.shift_class === '共用' 
                    ? [<span key="shared" className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg">共用</span>]
                    : m.shift_class.split(',').map((s, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg me-1">
                          {s.trim()}
                        </span>
                      ));

                  return (
                    <tr 
                      key={m.machine_id} 
                      className={cn(
                        "border-b border-slate-900 hover:bg-slate-900/30 text-slate-300 transition-colors",
                        idx % 2 === 1 ? "bg-slate-900/40" : "bg-transparent"
                      )}
                    >
                      <td className="p-3 font-mono font-extrabold text-base text-white">{m.machine_id}</td>
                      <td className="p-3 text-base">{m.location || '-'}</td>
                      <td className="p-3 flex flex-wrap gap-1 items-center text-base">{shifts}</td>
                      <td className="p-3">
                        <div className="flex justify-center items-center gap-1">
                          <button 
                            onClick={() => openEditModal(m)}
                            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                            title="編輯"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteMachine(m.machine_id)}
                            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                            title="刪除"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Machine Anomaly Report Area */}
      <div className="glass-panel p-6 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              機號異常比對報表
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              比對 ETL 資料與機台位置資料，列出員工在非所屬班別的刷卡機所留下的打卡記錄。
            </p>
          </div>
          <button
            onClick={handleRunComparison}
            disabled={!isETLReady || machineList.length === 0}
            className="btn-premium flex items-center gap-1.5 self-start sm:self-auto text-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            執行比對
          </button>
        </div>
      </div>

      {/* Anomaly Placeholder */}
      {!isReportActive && (
        <div className="glass-panel text-center py-10 bg-slate-900/20 border-dashed border-slate-800/80 no-print">
          <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-400">等待執行比對</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            請先完成 ETL 整合且設定機號資料庫，再點擊「執行比對」。
          </p>
        </div>
      )}

      {/* Anomaly tables */}
      {isReportActive && (
        <div className="space-y-6">
          {/* Anomaly records table */}
          <div className="glass-panel p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-800/60 no-print">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                需確認打卡記錄
                <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold rounded-lg text-xs ml-1">
                  {lastAnomalyData.length} 筆
                </span>
              </h4>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleExportAnomalyExcel}
                  className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  下載 Excel
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

            {/* Print Header */}
            <div className="page-header text-center mb-4 py-1 border-b border-slate-900 hidden print:block">
              <h2 className="text-base font-bold text-black">機號比對異常刷卡報表</h2>
              <div className="text-[11px] text-gray-500">需確認打卡紀錄共 {lastAnomalyData.length} 筆</div>
            </div>

            <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-950/20 print:border-gray-400">
              <table className="w-full text-left border-collapse text-sm print:text-black">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-350 font-bold print:bg-gray-200 print:text-black text-sm md:text-base">
                    <th className="p-3 w-28">卡號</th>
                    <th className="p-3 w-28">姓名</th>
                    <th className="p-3 w-28">班別</th>
                    <th className="p-3 w-32">日期</th>
                    <th className="p-3 w-28">打卡時間</th>
                    <th className="p-3 w-24">打卡機號</th>
                    <th className="p-3">實體位置</th>
                  </tr>
                </thead>
                <tbody>
                  {lastAnomalyData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-emerald-400 font-semibold"><ShieldCheck className="w-5 h-5 inline me-1.5" />本期無任何異常打卡記錄！</td>
                    </tr>
                  ) : (
                    getGroupedAnomalies().map((emp) => {
                      const dates = Array.from(emp.byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
                      const totalCount = dates.reduce((sum, [, punches]) => sum + punches.length, 0);

                      return (
                        <React.Fragment key={emp.emp_id}>
                          {/* Employee Header row */}
                          <tr className="bg-amber-500/[0.03] border-b border-slate-900 text-slate-300 print:bg-gray-100 print:text-black">
                            <td className="p-3 font-mono font-bold text-base text-indigo-400 print:text-black">{emp.emp_id}</td>
                            <td className="p-3 font-bold text-base text-white print:text-black">{emp.name}</td>
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg print:border-gray-400 print:text-black">
                                {emp.shift_class || '-'}
                              </span>
                            </td>
                            <td colSpan={4} className="p-3 text-slate-400 text-sm font-bold">共 {totalCount} 筆異常紀錄</td>
                          </tr>
                          
                          {/* Daily details */}
                          {dates.map(([date, punches]) => 
                            punches.map((punch, idx) => (
                              <tr key={`${date}_${idx}`} className="border-b border-slate-900/60 text-slate-300 print:border-gray-200">
                                <td></td><td></td><td></td>
                                <td className="p-2 text-slate-400 font-mono text-base">{idx === 0 ? date : ''}</td>
                                <td className="p-2 font-mono text-base font-semibold">{punch.time}</td>
                                <td className="p-2 font-mono text-base font-bold text-rose-400 print:text-red-600">{punch.machine_id}</td>
                                <td className="p-2 text-slate-300 text-base">{punch.machine_location}</td>
                              </tr>
                            ))
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* No Shift Punches Section */}
          {lastNoShiftData.length > 0 && (
            <div className="glass-panel p-6">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-800/60 no-print">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  未設定班別人員打卡紀錄
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 font-bold rounded-lg text-xs ml-1">
                    {lastNoShiftData.length} 筆
                  </span>
                </h4>
                <button 
                  onClick={handleExportNoShiftExcel}
                  className="p-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors bg-slate-950/20"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  下載 Excel
                </button>
              </div>

              <p className="text-sm text-slate-500 mb-4 no-print">
                以下人員未在員工主資料庫中設定適用班別，系統無法自動進行打卡機配對，僅列出供參考補建檔。
              </p>

              <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-950/20 print:border-gray-400">
                <table className="w-full text-left border-collapse text-xs print:text-black">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold print:bg-gray-100 print:text-black">
                      <th className="p-3 w-28">卡號</th>
                      <th className="p-3 w-28">姓名</th>
                      <th className="p-3 w-32">日期</th>
                      <th className="p-3 w-28">打卡時間</th>
                      <th className="p-3 w-24">打卡機號</th>
                      <th className="p-3">位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getGroupedNoShifts().map((emp) => {
                      const dates = Array.from(emp.byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
                      const total = dates.reduce((s, [, p]) => s + p.length, 0);

                      return (
                        <React.Fragment key={emp.key}>
                          <tr className="bg-slate-950/60 border-b border-slate-900 text-slate-400 print:bg-gray-50 print:text-black">
                            <td className="p-3 font-mono font-bold text-slate-400">{emp.emp_id || <span className="text-slate-600 font-normal italic">無卡號</span>}</td>
                            <td className="p-3 font-bold text-slate-200 print:text-black">
                              {emp.name}
                              <br /><span className="text-xs text-slate-600 font-mono">{emp.account_id || ''}</span>
                            </td>
                            <td colSpan={4} className="p-3 text-slate-600 font-semibold">共 {total} 筆打卡紀錄</td>
                          </tr>
                          {dates.map(([date, punches]) => 
                            punches.map((p, idx) => (
                              <tr key={`${date}_${idx}`} className="border-b border-slate-900/60 text-slate-400 print:border-gray-200">
                                <td></td><td></td>
                                <td className="p-2 text-slate-500 font-mono">{idx === 0 ? date : ''}</td>
                                <td className="p-2 font-mono font-semibold">{p.time}</td>
                                <td className="p-2 font-mono">{p.machine_id}</td>
                                <td className="p-2 text-slate-500 text-sm">{p.machine_location}</td>
                              </tr>
                            ))
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CRUD Modal for Hand-Adding / Editing Machine */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel max-w-sm w-full p-6 bg-slate-900 border-slate-800/80 flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Network className="w-5 h-5 text-indigo-400" />
                {modalMode === 'add' ? '手動新增機台' : '編輯機台資料'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form body */}
            <form onSubmit={handleSaveMachine} className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">機號 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit'}
                  value={formData.machine_id}
                  onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                  placeholder="例如: I0F"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">位置 (實體說明)</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="例如: 新店清潔隊安一左"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">所屬班別 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.shift_class}
                  onChange={(e) => setFormData({ ...formData, shift_class: e.target.value })}
                  placeholder="例如: 共用 或 地勤一班,地勤二班"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
                <div className="text-xs text-slate-500 mt-1">多班別請用半形逗號分隔。填「共用」代表所有班別皆可使用。</div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 px-4 py-2 border border-slate-850 text-slate-400 hover:text-white rounded-xl text-xs font-semibold hover:bg-slate-850 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 btn-premium text-xs font-semibold py-2"
                >
                  儲存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
