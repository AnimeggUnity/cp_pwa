import React from 'react';
import { 
  FileSpreadsheet, 
  Users, 
  BarChart3, 
  CalendarOff, 
  Network, 
  Search,
  Database,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { usePunchStore } from '../../store/usePunchStore';

interface NavbarProps {
  activeTab: string;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab }) => {
  const employeeCount = usePunchStore((state) => state.employeeList.length);
  const machineCount = usePunchStore((state) => state.machineList.length);
  const isETLReady = usePunchStore((state) => state.integratedPunchData.length > 0);

  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'upload':
        return {
          title: '考勤資料匯入',
          desc: '上傳考勤刷卡資料 Excel，並進行標準化整理。',
          icon: FileSpreadsheet
        };
      case 'employees':
        return {
          title: '員工名冊管理',
          desc: '管理核心員工資料庫，支援手動編輯及 Excel 資料複製貼上匯入。',
          icon: Users
        };
      case 'reports':
        return {
          title: '薪資報表中心',
          desc: '產生夜點津貼、單日考勤明細及完整月度考勤表。',
          icon: BarChart3
        };
      case 'leave':
        return {
          title: '請假扣款中心',
          desc: '匯入請假考勤月曆 Excel，自動進行事假及病假扣款精密運算。',
          icon: CalendarOff
        };
      case 'machines':
        return {
          title: '機號比對設定',
          desc: '設定實體打卡鐘位置與對應班別，比對是否有跨區域打卡異常。',
          icon: Network
        };
      case 'full-machine':
        return {
          title: '完整打卡紀錄 + 機號比對',
          desc: '逐筆分析所有員工每日打卡時間與所屬打卡機位置，標示異常。',
          icon: Search
        };
      default:
        return {
          title: '打卡助理',
          desc: '企業考勤 ETL 整理與統計中心。',
          icon: FileSpreadsheet
        };
    }
  };

  const info = getHeaderInfo();
  const Icon = info.icon;

  return (
    <header className="bg-slate-900/60 backdrop-blur-md border-b border-slate-800 p-4 px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
      {/* View Title */}
      <div className="flex items-center gap-3">
        <span className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
          <Icon className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-lg font-bold text-white leading-tight">{info.title}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{info.desc}</p>
        </div>
      </div>

      {/* Roster & Database badges */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Employee Roster Status Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-400">員工名冊:</span>
          <span className="font-bold text-white">{employeeCount} 人</span>
        </div>

        {/* Machine Database Status Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs">
          <Network className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-slate-400">機台設定:</span>
          <span className="font-bold text-white">{machineCount} 台</span>
        </div>

        {/* ETL Status Badge */}
        {isETLReady ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-medium">考勤已整合 (ETL)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="font-medium">尚未執行 ETL</span>
          </div>
        )}
      </div>
    </header>
  );
};
