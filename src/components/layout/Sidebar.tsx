import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Users, 
  BarChart3, 
  CalendarOff, 
  Network, 
  Search, 
  Trash2, 
  ChevronRight,
  Terminal
} from 'lucide-react';
import { usePunchStore } from '../../store/usePunchStore';
import { cn } from '../../lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const logs = usePunchStore((state) => state.logs);
  const clearLogs = usePunchStore((state) => state.clearLogs);
  const logBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const menuItems = [
    { id: 'upload', label: '考勤資料匯入', icon: FileSpreadsheet },
    { id: 'employees', label: '員工名冊管理', icon: Users },
    { id: 'reports', label: '薪資報表中心', icon: BarChart3 },
    { id: 'leave', label: '請假扣款中心', icon: CalendarOff },
    { id: 'machines', label: '機號比對設定', icon: Network },
    { id: 'full-machine', label: '完整打卡+機號比對', icon: Search },
  ];

  return (
    <aside 
      className={cn(
        "bg-slate-900 border-r border-slate-800 text-slate-300 transition-all duration-300 flex flex-col h-screen no-print",
        isCollapsed ? "w-16" : "w-72"
      )}
    >
      {/* Brand area */}
      <div className="p-4 flex items-center justify-between border-b border-slate-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2 font-bold text-white text-lg truncate">
            <span className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
              <Terminal className="w-5 h-5" />
            </span>
            <span>打卡助手</span>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          title={isCollapsed ? "展開側邊欄" : "折疊側邊欄"}
        >
          <ChevronRight className={cn("w-5 h-5 transition-transform", isCollapsed ? "" : "rotate-180")} />
        </button>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all duration-200 group relative",
                isActive 
                  ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-950/30" 
                  : "hover:bg-slate-850 hover:text-slate-100"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={cn("w-5 h-5 flex-shrink-0", isCollapsed ? "" : "mr-3")} />
              {!isCollapsed && <span className="font-semibold text-sm">{item.label}</span>}
              {isActive && !isCollapsed && (
                <span className="absolute right-3 w-1.5 h-1.5 bg-white rounded-full"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Interactive System logs (Terminal Box) */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs uppercase font-bold tracking-wider text-indigo-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
              系統日誌
            </label>
            <button
              onClick={clearLogs}
              className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-0.5 transition-colors border border-slate-800 px-1.5 py-0.5 rounded"
            >
              <Trash2 className="w-2.5 h-2.5" />
              清除
            </button>
          </div>
          <div ref={logBoxRef} className="h-36 border border-slate-850 bg-slate-950/90 rounded-lg p-2 font-mono text-[11px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
            {logs.map((log) => (
              <div 
                key={log.id} 
                className={cn(
                  "mb-1 leading-relaxed break-all",
                  log.type === 'success' && "text-emerald-400",
                  log.type === 'warning' && "text-amber-400",
                  log.type === 'error' && "text-rose-400 font-semibold",
                  log.type === 'info' && "text-slate-300"
                )}
              >
                <span className="text-slate-600 me-1">[{log.time}]</span>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};
