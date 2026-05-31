import React, { useState, useRef } from 'react';
import { usePunchStore } from '../store/usePunchStore';
import { 
  UserPlus, 
  Trash2, 
  Download, 
  Upload, 
  FileText, 
  Search, 
  Edit3, 
  Trash, 
  User, 
  UserCheck, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Employee } from '../types';

export const EmployeeRoster: React.FC = () => {
  const employeeList = usePunchStore((state) => state.employeeList);
  const addEmployee = usePunchStore((state) => state.addEmployee);
  const updateEmployee = usePunchStore((state) => state.updateEmployee);
  const deleteEmployee = usePunchStore((state) => state.deleteEmployee);
  const clearEmployeeDatabase = usePunchStore((state) => state.clearEmployeeDatabase);
  const importEmployeeTSV = usePunchStore((state) => state.importEmployeeTSV);
  const saveEmployeeList = usePunchStore((state) => state.saveEmployeeList);
  const addLog = usePunchStore((state) => state.addLog);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [tsvText, setTsvText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    emp_id: '',
    account_id: '',
    shift_class: '',
    is_driver: false
  });

  const safeEmployeeList = Array.isArray(employeeList) ? employeeList.filter(Boolean) : [];

  const normalCount = safeEmployeeList.filter(e => !e.is_driver).length;
  const driverCount = safeEmployeeList.filter(e => e.is_driver).length;

  // Filter & Search Logic
  const query = searchQuery.trim().toLowerCase();
  const textFiltered = safeEmployeeList.filter(emp => {
    const name = emp.name ? String(emp.name).toLowerCase() : '';
    const empId = emp.emp_id ? String(emp.emp_id).toLowerCase() : '';
    const accountId = emp.account_id ? String(emp.account_id).toLowerCase() : '';
    const shiftClass = emp.shift_class ? String(emp.shift_class).toLowerCase() : '';
    
    return name.includes(query) ||
           empId.includes(query) ||
           accountId.includes(query) ||
           shiftClass.includes(query);
  });

  const allShifts = Array.from(new Set(textFiltered.map(emp => emp.shift_class || '未設定班別'))).sort();

  const filtered = (shiftFilter === 'all'
    ? textFiltered
    : textFiltered.filter(emp => (emp.shift_class || '未設定班別') === shiftFilter))
    .sort((a, b) => (a.emp_id || '').localeCompare(b.emp_id || ''));

  const totalRows = filtered.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  
  // Guard current page boundary
  const activePage = currentPage > totalPages ? Math.max(1, totalPages) : currentPage;
  const startIndex = (activePage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
  const currentPageData = filtered.slice(startIndex, endIndex);

  const handleImportTSV = () => {
    if (!tsvText.trim()) {
      alert('請先在輸入框貼上 Excel 複製的資料！');
      return;
    }
    const res = importEmployeeTSV(tsvText);
    if (res.success) {
      alert(res.message);
      setTsvText('');
    } else {
      alert('匯入失敗：' + res.message);
    }
  };

  const handleClearDatabase = () => {
    if (employeeList.length === 0) return;
    if (window.confirm(`確定要清空全部 ${employeeList.length} 筆員工資料嗎？此操作無法復原。`)) {
      clearEmployeeDatabase();
    }
  };

  const handleBackupExport = () => {
    if (employeeList.length === 0) {
      alert('資料庫內無員工資料可供備份！');
      return;
    }
    try {
      const dataStr = JSON.stringify(employeeList, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `員工資料庫備份_${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('員工資料庫備份下載成功。', 'success');
    } catch (err: any) {
      addLog(`備份失敗: ${err.message}`, 'error');
      alert('備份失敗！');
    }
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addLog(`開始自備份還原員工資料庫: ${file.name}...`, 'info');
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
        
        if (Array.isArray(data)) {
          const invalidItem = data.find(emp => !emp.emp_id || !emp.name);
          if (!invalidItem) {
            await saveEmployeeList(data as Employee[]);
            addLog(`資料庫還原成功！共匯入 ${data.length} 筆員工記錄。`, 'success');
            alert(`還原備份成功，共載入 ${data.length} 筆員工資料！`);
          } else {
            throw new Error(`還原檔資料結構不正確。有些記錄缺少 [卡號] 或 [姓名]。例如這一筆：${JSON.stringify(invalidItem)}`);
          }
        } else {
          throw new Error('還原檔案內容必須是 JSON 陣列格式（例如以 [ 開頭）。');
        }
      } catch (err: any) {
        addLog(`還原備份失敗: ${err.message}`, 'error');
        alert(`還原失敗：${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const openAddModal = () => {
    setModalMode('add');
    setFormData({
      name: '',
      emp_id: '',
      account_id: '',
      shift_class: '',
      is_driver: false
    });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setModalMode('edit');
    setFormData({
      name: emp.name,
      emp_id: emp.emp_id,
      account_id: emp.account_id || '',
      shift_class: emp.shift_class || '',
      is_driver: emp.is_driver
    });
    setEditingId(emp.emp_id);
    setIsModalOpen(true);
  };

  const handleDeleteEmployee = (empId: string, name: string) => {
    if (window.confirm(`確定要刪除員工 [${name}] (卡號: ${empId}) 的資料嗎？`)) {
      deleteEmployee(empId);
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, emp_id, account_id, shift_class, is_driver } = formData;
    if (!name.trim() || !emp_id.trim()) {
      alert('姓名與卡號為必填欄位！');
      return;
    }

    const employeeObj: Employee = {
      name: name.trim(),
      emp_id: emp_id.trim(),
      account_id: account_id.trim() || undefined,
      shift_class: shift_class.trim(),
      is_driver
    };

    if (modalMode === 'add') {
      const success = await addEmployee(employeeObj);
      if (!success) {
        alert(`卡號 [${emp_id}] 已存在於資料庫中，不可重複！`);
        return;
      }
    } else {
      if (editingId) {
        const success = await updateEmployee(editingId, employeeObj);
        if (!success) {
          alert(`卡號 [${emp_id}] 已存在於資料庫中，不可重複！`);
          return;
        }
      }
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* DB Core actions and past tsv block */}
      <div className="glass-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-800/60">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-indigo-400" />
            員工主資料庫
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
              <UserPlus className="w-3.5 h-3.5" />
              手動新增
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          <strong>智慧雙格式支援：</strong>直接從 Excel 複製以下任一格式並於下方貼上，系統會智慧解析欄位：<br />
          • 格式 A：<code>班別  卡號  姓名  公務帳號  司機</code> (完整名冊)<br />
          • 格式 B：<code>公務帳號  卡號  姓名</code> (獨立司機名名冊，自動更新現有員工屬性)<br />
          <span className="text-slate-500">支援分隔符：<strong className="text-slate-400">Tab</strong>（Excel 複製貼上）、<strong className="text-slate-400">逗號</strong>、<strong className="text-slate-400">兩個以上空格</strong>。單一空格不支援。</span>
        </p>

        {/* Text Area for Pasting */}
        <div className="space-y-3 mb-6">
          <textarea
            value={tsvText}
            onChange={(e) => setTsvText(e.target.value)}
            rows={3}
            placeholder="請將 Excel 選取的資料直接 Ctrl+V 貼在此處... 系統會智慧解析欄位。"
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <button onClick={handleImportTSV} className="btn-outline-premium w-full flex items-center justify-center gap-2 py-2.5">
            <FileText className="w-4 h-4" />
            智慧解析並匯入
          </button>
        </div>


      </div>

      {/* Database Viewer grid */}
      <div className="glass-panel p-6">
        {/* Statistics and filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-white text-base">目前資料庫員工：</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg">{employeeList.length} 人</span>
              <span className="text-xs text-slate-400">一般員工: <strong className="text-slate-200">{normalCount}</strong> 人 | 司機名冊: <strong className="text-slate-200">{driverCount}</strong> 人</span>
            </div>
          </div>

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
                setCurrentPage(1);
                if (!e.target.value) setShiftFilter('all');
              }}
              placeholder="搜尋姓名、卡號、工號或班別..."
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Dynamic shifts filter row */}
        {allShifts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4 p-3 bg-slate-950/40 border border-slate-850 rounded-xl">
            <span className="text-xs text-slate-500 font-bold me-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
              組別快速篩選：
            </span>
            <button
              onClick={() => { setShiftFilter('all'); setCurrentPage(1); }}
              className={cn(
                "px-2.5 py-1 text-sm rounded-lg transition-colors font-semibold",
                shiftFilter === 'all' ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
              )}
            >
              全部 ({textFiltered.length}人)
            </button>
            {allShifts.map(shift => {
              const count = textFiltered.filter(emp => (emp.shift_class || '未設定班別') === shift).length;
              return (
                <button
                  key={shift}
                  onClick={() => { setShiftFilter(shift); setCurrentPage(1); }}
                  className={cn(
                    "px-2.5 py-1 text-sm rounded-lg transition-colors font-semibold",
                    shiftFilter === shift ? "bg-indigo-600 text-white" : "hover:bg-slate-850 text-slate-400"
                  )}
                >
                  {shift} ({count}人)
                </button>
              );
            })}
          </div>
        )}

        {/* Roster table */}
        <div className="overflow-x-auto border border-slate-850 bg-slate-950/20 rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-300 font-bold text-center text-sm md:text-base">
                <th className="p-3 text-left">卡號/工號</th>
                <th className="p-3 text-left">姓名</th>
                <th className="p-3 text-left">公務帳號</th>
                <th className="p-3 text-left">班別</th>
                <th className="p-3">屬性</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {currentPageData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">沒有找到相符的員工記錄。</td>
                </tr>
              ) : (
                currentPageData.map((emp, idx) => (
                  <tr 
                    key={emp.emp_id} 
                    className={cn(
                      "border-b border-slate-900 hover:bg-slate-900/30 transition-colors text-slate-300",
                      idx % 2 === 1 ? "bg-slate-900/40" : "bg-transparent"
                    )}
                  >
                    <td className="p-3 font-mono text-base font-bold text-white/90">{emp.emp_id}</td>
                    <td className="p-3 font-semibold text-base text-white">{emp.name}</td>
                    <td className="p-3 font-mono text-base">{emp.account_id || '-'}</td>
                    <td className="p-3 text-base">{emp.shift_class || '-'}</td>
                    <td className="p-3 text-center text-base">
                      {emp.is_driver ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold rounded-lg text-xs">
                          司機
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center items-center gap-1">
                        <button 
                          onClick={() => openEditModal(emp)}
                          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                          title="編輯"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteEmployee(emp.emp_id, emp.name)}
                          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                          title="刪除"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paging controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-900/60 no-print">
            <span className="text-xs md:text-sm text-slate-400 font-medium">
              顯示第 <strong className="text-slate-200">{startIndex + 1}</strong> - <strong className="text-slate-200">{endIndex}</strong> 筆，共 <strong className="text-indigo-400">{totalRows}</strong> 筆
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
                if (totalPages > 5 && Math.abs(p - activePage) > 1 && p !== 1 && p !== totalPages) {
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

      {/* CRUD Modal for Hand-Adding / Editing */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel max-w-sm w-full p-6 bg-slate-900 border-slate-800/80 flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-400" />
                {modalMode === 'add' ? '手動新增員工' : '編輯員工資料'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form body */}
            <form onSubmit={handleSaveEmployee} className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">姓名 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: 林俊傑"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">員工卡號 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  disabled={modalMode === 'edit'}
                  value={formData.emp_id}
                  onChange={(e) => setFormData({ ...formData, emp_id: e.target.value })}
                  placeholder="請輸入卡號/工號 (如: 0928029003)"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">公務帳號 (選填)</label>
                <input
                  type="text"
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  placeholder="請輸入公務通訊帳號"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">所屬班別</label>
                <input
                  type="text"
                  value={formData.shift_class}
                  onChange={(e) => setFormData({ ...formData, shift_class: e.target.value })}
                  placeholder="例如: A班, 地勤一班"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-950/60 rounded-xl border border-slate-850/80">
                <span className="text-sm font-bold text-slate-300">標記為司機</span>
                <input
                  type="checkbox"
                  checked={formData.is_driver}
                  onChange={(e) => setFormData({ ...formData, is_driver: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-850"
                />
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
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
