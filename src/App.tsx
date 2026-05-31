import { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { PunchUpload } from './pages/PunchUpload';
import { EmployeeRoster } from './pages/EmployeeRoster';
import { SalaryReports } from './pages/SalaryReports';
import { LeaveDeduction } from './pages/LeaveDeduction';
import { MachineConfig } from './pages/MachineConfig';
import { FullMachineMatch } from './pages/FullMachineMatch';
import { usePunchStore } from './store/usePunchStore';
import PWAPrompt from './components/PWAPrompt';

function App() {
  const [activeTab, setActiveTab] = useState('upload');
  const loadFromIndexedDB = usePunchStore((state) => state.loadFromIndexedDB);

  useEffect(() => {
    loadFromIndexedDB();
  }, [loadFromIndexedDB]);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans antialiased text-slate-200">
      {/* 20% Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* 80% Main Content View Frame */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar activeTab={activeTab} />
        
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          <div className="space-y-6 animate-in fade-in duration-300">
            {activeTab === 'upload' && <PunchUpload />}
            {activeTab === 'employees' && <EmployeeRoster />}
            {activeTab === 'reports' && <SalaryReports />}
            {activeTab === 'leave' && <LeaveDeduction />}
            {activeTab === 'machines' && <MachineConfig />}
            {activeTab === 'full-machine' && <FullMachineMatch />}
            
            {/* Fallback segment */}
            {activeTab !== 'upload' && 
             activeTab !== 'employees' && 
             activeTab !== 'reports' && 
             activeTab !== 'leave' && 
             activeTab !== 'machines' && 
             activeTab !== 'full-machine' && (
              <div className="flex flex-col items-center justify-center h-64 bg-slate-900 border border-slate-800 border-dashed rounded-2xl">
                <p className="text-slate-400 font-medium">「{activeTab}」功能模組開發中...</p>
                <button 
                  onClick={() => setActiveTab('upload')}
                  className="mt-4 text-indigo-400 font-semibold hover:underline"
                >
                  返回首頁
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
      <PWAPrompt />
    </div>
  );
}

export default App;
