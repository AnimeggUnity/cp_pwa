import { create } from 'zustand';
import { get, set } from 'idb-keyval';
import type {
  Employee,
  Machine,
  PunchRecord,
  LeaveRecord,
  IntegratedRecord,
  SystemLog,
  MachineAnomalyRecord,
  NoShiftPunchRecord,
  UnknownMachineRecord
} from '../types';

interface PunchState {
  // States
  employeeList: Employee[];
  machineList: Machine[];
  rawPunchData: PunchRecord[];
  rawLeaveData: LeaveRecord[];
  integratedPunchData: IntegratedRecord[];
  availableDates: string[];
  logs: SystemLog[];
  isLoading: boolean;
  lastAnomalyData: MachineAnomalyRecord[];
  lastNoShiftData: NoShiftPunchRecord[];
  lastUnknownMachineData: UnknownMachineRecord[];

  // Actions
  addLog: (message: string, type?: SystemLog['type']) => void;
  clearLogs: () => void;
  loadFromIndexedDB: () => Promise<void>;
  
  // Employee CRUD & Actions
  saveEmployeeList: (list: Employee[]) => Promise<void>;
  addEmployee: (employee: Employee) => Promise<boolean>;
  updateEmployee: (originalEmpId: string, employee: Employee) => Promise<boolean>;
  deleteEmployee: (empId: string) => Promise<void>;
  clearEmployeeDatabase: () => Promise<void>;
  importEmployeeTSV: (text: string) => { success: boolean; count: number; type: 'A' | 'B'; message: string };

  // Machine CRUD & Actions
  saveMachineList: (list: Machine[]) => Promise<void>;
  addMachine: (machine: Machine) => Promise<boolean>;
  updateMachine: (originalId: string, machine: Machine) => Promise<boolean>;
  deleteMachine: (machineId: string) => Promise<void>;
  clearMachineDatabase: () => Promise<void>;
  importMachineTSV: (text: string) => { success: boolean; count: number; message: string };

  // Data Loading
  setRawPunchData: (data: PunchRecord[]) => void;
  setRawLeaveData: (data: LeaveRecord[]) => void;

  // Business Logic
  runETLPipeline: () => { success: boolean; count: number; dateRange: string };
  generateMachineAnomalyReport: () => { success: boolean; anomalyCount: number; noShiftCount: number; unknownCount: number };
}

export const usePunchStore = create<PunchState>((setStore, getStore) => ({
  employeeList: [],
  machineList: [],
  rawPunchData: [],
  rawLeaveData: [],
  integratedPunchData: [],
  availableDates: [],
  logs: [{ id: '1', time: new Date().toLocaleTimeString(), message: '打卡助手 React 版初始化完成。', type: 'info' }],
  isLoading: false,
  lastAnomalyData: [],
  lastNoShiftData: [],
  lastUnknownMachineData: [],

  addLog: (message: string, type: SystemLog['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    const newLog: SystemLog = {
      id: Math.random().toString(36).substring(2, 9),
      time,
      message,
      type
    };
    setStore((state) => ({ logs: [...state.logs, newLog] }));
  },

  clearLogs: () => {
    setStore({ logs: [{ id: '1', time: new Date().toLocaleTimeString(), message: '執行日誌已清除。', type: 'info' }] });
  },

  loadFromIndexedDB: async () => {
    setStore({ isLoading: true });
    try {
      let storedEmployees: Employee[] | null = null;
      let storedMachines: Machine[] | null = null;
      let idbFailed = false;

      try {
        storedEmployees = await get<Employee[]>('employee_directory') || null;
        storedMachines = await get<Machine[]>('machine_directory') || null;
      } catch (idbErr) {
        console.warn('IndexedDB read failed, falling back to localStorage:', idbErr);
        idbFailed = true;
      }
      
      // 智慧自動移植：若 IndexedDB 無資料，但偵測到瀏覽器 localStorage 有舊版 JS 的資料，則自動移植
      let migrated = false;
      if (!storedEmployees) {
        const localEmp = localStorage.getItem('employee_directory');
        if (localEmp) {
          try {
            const parsed = JSON.parse(localEmp);
            if (Array.isArray(parsed)) {
              storedEmployees = parsed;
              if (!idbFailed) {
                await set('employee_directory', parsed).catch(() => {});
              }
              migrated = true;
            }
          } catch {}
        }
      }
      
      if (!storedMachines) {
        const localMach = localStorage.getItem('machine_directory');
        if (localMach) {
          try {
            const parsed = JSON.parse(localMach);
            if (Array.isArray(parsed)) {
              storedMachines = parsed;
              if (!idbFailed) {
                await set('machine_directory', parsed).catch(() => {});
              }
              migrated = true;
            }
          } catch {}
        }
      }

      setStore({
        employeeList: storedEmployees || [],
        machineList: storedMachines || [],
        isLoading: false
      });
      
      if (migrated) {
        getStore().addLog(`[智慧移植] 成功自瀏覽器 LocalStorage 移植並升級舊版打卡資料庫！`, 'success');
      }
      getStore().addLog(`員工資料庫加載完成。共 ${storedEmployees?.length || 0} 筆員工記錄。`, 'success');
      getStore().addLog(`機號資料庫加載完成。共 ${storedMachines?.length || 0} 筆機台記錄。`, 'success');
    } catch (e) {
      getStore().addLog(`讀取資料庫失敗: ${e}`, 'error');
      setStore({ employeeList: [], machineList: [], isLoading: false });
    }
  },

  saveEmployeeList: async (list: Employee[]) => {
    setStore({ employeeList: list });
    try {
      await set('employee_directory', list);
    } catch (e: any) {
      console.warn('IndexedDB save failed, falling back to localStorage:', e);
      localStorage.setItem('employee_directory', JSON.stringify(list));
      getStore().addLog(`[資料庫快取啟動] IndexedDB 寫入失敗 (${e.message || e})，已自動儲存至 LocalStorage。`, 'warning');
    }
  },

  addEmployee: async (employee: Employee) => {
    const { employeeList, saveEmployeeList, addLog } = getStore();
    const isDup = employeeList.some(e => e.emp_id === employee.emp_id);
    if (isDup) {
      return false;
    }
    const newList = [...employeeList, employee];
    await saveEmployeeList(newList);
    addLog(`已手動新增員工: ${employee.name} (卡號: ${employee.emp_id})`, 'success');
    return true;
  },

  updateEmployee: async (originalEmpId: string, employee: Employee) => {
    const { employeeList, saveEmployeeList, addLog } = getStore();
    if (originalEmpId !== employee.emp_id) {
      const isDup = employeeList.some(e => e.emp_id === employee.emp_id);
      if (isDup) {
        return false;
      }
    }
    const newList = employeeList.map(e => e.emp_id === originalEmpId ? employee : e);
    await saveEmployeeList(newList);
    addLog(`已手動更新員工資料: ${employee.name} (卡號: ${employee.emp_id})`, 'success');
    return true;
  },

  deleteEmployee: async (empId: string) => {
    const { employeeList, saveEmployeeList, addLog } = getStore();
    const newList = employeeList.filter(e => e.emp_id !== empId);
    await saveEmployeeList(newList);
    addLog(`已刪除員工卡號: ${empId}`, 'warning');
  },

  clearEmployeeDatabase: async () => {
    const { addLog } = getStore();
    setStore({ employeeList: [] });
    await set('employee_directory', []);
    addLog('員工資料庫已清空。', 'warning');
  },

  importEmployeeTSV: (text: string) => {
    const { employeeList, saveEmployeeList, addLog } = getStore();
    const lines = text.split('\n');
    if (lines.length === 0 || !text.trim()) {
      return { success: false, count: 0, type: 'A', message: '未偵測到有效行。' };
    }

    const firstLineCols = lines[0].split(/\t|,| {2,}/).map(s => s.trim());
    let formatType: 'A' | 'B' = 'A';
    const headerJoined = firstLineCols.join('');
    if (firstLineCols.length === 3 && !headerJoined.includes('班') && !headerJoined.includes('司機')) {
      formatType = 'B';
    }

    addLog(`偵測到資料匯入格式為：[格式 ${formatType}] (${formatType === 'A' ? '完整員工名冊' : '獨立司機名單'})`, 'info');

    let headerIndex = {
      shift_class: -1,
      emp_id: -1,
      name: -1,
      account_id: -1,
      is_driver: -1
    };
    let dataStartRow = 1;

    if (formatType === 'A') {
      firstLineCols.forEach((header, index) => {
        if (header.includes('班')) headerIndex.shift_class = index;
        else if (header.includes('卡') || header.includes('工號') || header.includes('id')) headerIndex.emp_id = index;
        else if (header.includes('名') || header.includes('name')) headerIndex.name = index;
        else if (header.includes('帳') || header.includes('公務') || header.includes('acc')) headerIndex.account_id = index;
        else if (header.includes('司機') || header.includes('是否') || header.includes('駕駛')) headerIndex.is_driver = index;
      });

      if (headerIndex.emp_id === -1 && headerIndex.name === -1) {
        addLog('未偵測到明確標題，採用預設完整欄位順序：[班別, 卡號, 姓名, 公務帳號, 司機]', 'warning');
        headerIndex = { shift_class: 0, emp_id: 1, name: 2, account_id: 3, is_driver: 4 };
        dataStartRow = 0;
      } else {
        addLog(`解析到欄位索引: ${JSON.stringify(headerIndex)}`, 'success');
      }

      let importedCount = 0;
      const newEmployees: Employee[] = [];

      for (let i = dataStartRow; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(/\t|,| {2,}/).map(s => s.trim());

        const emp_id = headerIndex.emp_id !== -1 && cols[headerIndex.emp_id] ? cols[headerIndex.emp_id] : '';
        const name = headerIndex.name !== -1 && cols[headerIndex.name] ? cols[headerIndex.name] : '';

        if (!emp_id || !name) continue;

        const shift_class = headerIndex.shift_class !== -1 && cols[headerIndex.shift_class] ? cols[headerIndex.shift_class] : '';
        const account_id = headerIndex.account_id !== -1 && cols[headerIndex.account_id] ? cols[headerIndex.account_id] : '';
        
        let is_driver = false;
        if (headerIndex.is_driver !== -1 && cols[headerIndex.is_driver]) {
          const val = cols[headerIndex.is_driver].trim().toLowerCase();
          if (
            val.includes('是') || 
            val.includes('y') || 
            val.includes('t') || 
            val.includes('true') || 
            val.includes('1') || 
            val.includes('司機') ||
            val.includes('駕駛') ||
            val.includes('v') ||
            val.includes('✓')
          ) {
            is_driver = true;
          }
        }
        newEmployees.push({ emp_id, name, shift_class, account_id, is_driver });
        importedCount++;
      }

      if (newEmployees.length > 0) {
        const existingMap = new Map(employeeList.map(e => [e.emp_id, e]));
        newEmployees.forEach(emp => {
          existingMap.set(emp.emp_id, emp);
        });
        const finalEmployees = Array.from(existingMap.values());
        saveEmployeeList(finalEmployees);
        addLog(`完整員工名冊匯入完成！成功新增/更新 ${importedCount} 筆。`, 'success');
        return { success: true, count: importedCount, type: 'A', message: `成功匯入 ${importedCount} 筆員工名冊！` };
      }
    } else {
      // Format B
      firstLineCols.forEach((header, index) => {
        if (header.includes('帳') || header.includes('公務') || header.includes('acc')) headerIndex.account_id = index;
        else if (header.includes('卡') || header.includes('工號') || header.includes('id')) headerIndex.emp_id = index;
        else if (header.includes('名') || header.includes('name')) headerIndex.name = index;
      });

      if (headerIndex.emp_id === -1 && headerIndex.account_id === -1) {
        addLog('未偵測到明確標題，採用預設司機名單順序：[公務帳號, 卡號, 姓名]', 'warning');
        headerIndex = { account_id: 0, emp_id: 1, name: 2, shift_class: -1, is_driver: -1 };
        dataStartRow = 0;
      } else {
        addLog(`解析到司機名單欄位索引: ${JSON.stringify(headerIndex)}`, 'success');
      }

      let updatedDriverCount = 0;
      let addedDriverCount = 0;
      const currentList = [...employeeList];
      const empIdMap = new Map(currentList.map(e => [e.emp_id, e]));
      const accIdMap = new Map(currentList.map(e => [e.account_id || '', e]));

      for (let i = dataStartRow; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(/\t|,| {2,}/).map(s => s.trim());

        const account_id = headerIndex.account_id !== -1 && cols[headerIndex.account_id] ? cols[headerIndex.account_id] : '';
        const emp_id = headerIndex.emp_id !== -1 && cols[headerIndex.emp_id] ? cols[headerIndex.emp_id] : '';
        const name = headerIndex.name !== -1 && cols[headerIndex.name] ? cols[headerIndex.name] : '';

        if (!emp_id && !account_id) continue;

        let existingEmp = null;
        if (emp_id) existingEmp = empIdMap.get(emp_id);
        if (!existingEmp && account_id) existingEmp = accIdMap.get(account_id);

        if (existingEmp) {
          existingEmp.is_driver = true;
          if (account_id && !existingEmp.account_id) existingEmp.account_id = account_id;
          updatedDriverCount++;
        } else {
          const newEmp: Employee = {
            emp_id: emp_id || `DRV_${Math.random().toString(36).substring(2, 7)}`,
            name: name || '未命名司機',
            shift_class: '',
            account_id,
            is_driver: true
          };
          currentList.push(newEmp);
          empIdMap.set(newEmp.emp_id, newEmp);
          if (account_id) accIdMap.set(account_id, newEmp);
          addedDriverCount++;
        }
      }

      saveEmployeeList(currentList);
      addLog(`司機名冊智慧整合完成！成功標記現有員工 ${updatedDriverCount} 人為司機，新增未建檔司機 ${addedDriverCount} 人。`, 'success');
      return { 
        success: true, 
        count: updatedDriverCount + addedDriverCount, 
        type: 'B', 
        message: `司機名冊整合完成！\n標記現有員工: ${updatedDriverCount} 人\n新增獨立司機: ${addedDriverCount} 人` 
      };
    }
    return { success: false, count: 0, type: 'A', message: '未解析到任何有效員工資料！' };
  },

  // Machine Actions
  saveMachineList: async (list: Machine[]) => {
    setStore({ machineList: list });
    try {
      await set('machine_directory', list);
    } catch (e: any) {
      console.warn('IndexedDB save failed, falling back to localStorage:', e);
      localStorage.setItem('machine_directory', JSON.stringify(list));
      getStore().addLog(`[資料庫快取啟動] IndexedDB 寫入失敗 (${e.message || e})，已自動儲存至 LocalStorage。`, 'warning');
    }
  },

  addMachine: async (machine: Machine) => {
    const { machineList, saveMachineList, addLog } = getStore();
    const isDup = machineList.some(m => m.machine_id === machine.machine_id);
    if (isDup) return false;
    const newList = [...machineList, machine];
    await saveMachineList(newList);
    addLog(`已新增機台: ${machine.machine_id} (${machine.location})`, 'success');
    return true;
  },

  updateMachine: async (originalId: string, machine: Machine) => {
    const { machineList, saveMachineList, addLog } = getStore();
    if (originalId !== machine.machine_id) {
      const isDup = machineList.some(m => m.machine_id === machine.machine_id);
      if (isDup) return false;
    }
    const newList = machineList.map(m => m.machine_id === originalId ? machine : m);
    await saveMachineList(newList);
    addLog(`已更新機台: ${machine.machine_id}`, 'success');
    return true;
  },

  deleteMachine: async (machineId: string) => {
    const { machineList, saveMachineList, addLog } = getStore();
    const newList = machineList.filter(m => m.machine_id !== machineId);
    await saveMachineList(newList);
    addLog(`已刪除機台: ${machineId}`, 'warning');
  },

  clearMachineDatabase: async () => {
    const { addLog } = getStore();
    setStore({ machineList: [] });
    await set('machine_directory', []);
    addLog('機號資料庫已清空。', 'warning');
  },

  importMachineTSV: (text: string) => {
    const { machineList, saveMachineList, addLog } = getStore();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      return { success: false, count: 0, message: '請先貼上資料！' };
    }

    const firstCols = lines[0].split(/\t|,| {2,}/).map(s => s.trim());
    const hasHeader = firstCols.some(c => ['機號', '位置', '班別'].includes(c));
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const existingMap = new Map(machineList.map(m => [m.machine_id, m]));
    let count = 0;

    dataLines.forEach(line => {
      const cols = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)| {2,}/).map(s => s.trim());
      if (cols.length < 1 || !cols[0]) return;
      const machine_id = cols[0];
      const location = cols[1] || '';
      const shift_class = cols[2] || '共用';
      existingMap.set(machine_id, { machine_id, location, shift_class });
      count++;
    });

    saveMachineList(Array.from(existingMap.values()));
    addLog(`機台資料匯入完成！成功新增/更新 ${count} 筆。`, 'success');
    return { success: true, count, message: `成功匯入 ${count} 筆機台資料！` };
  },

  setRawPunchData: (data: PunchRecord[]) => {
    setStore({ rawPunchData: data });
  },

  setRawLeaveData: (data: LeaveRecord[]) => {
    setStore({ rawLeaveData: data });
  },

  // Business Logic Pipelines
  runETLPipeline: () => {
    const { employeeList, rawPunchData, addLog } = getStore();
    addLog('執行資料整理 (ETL)...', 'info');

    try {
      const empMap = new Map(employeeList.map(emp => [emp.emp_id, emp]));
      
      // 1. LEFT JOIN
      const integratedList = rawPunchData.map(punch => {
        const emp = employeeList.find(e => e.account_id === punch.account_id) || empMap.get(punch.account_id) || ({} as Partial<Employee>);
        
        return {
          ...punch,
          shift_class: emp.shift_class || '未設定班別',
          is_driver: emp.is_driver || false,
          emp_id: emp.emp_id || punch.emp_id,
          name: emp.name || punch.name
        };
      });

      // 2. GROUP BY Employee + Date
      const grouped = new Map<string, any>();
      integratedList.forEach(row => {
        const key = `${row.account_id}_${row.punch_date}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            emp_id: row.emp_id,
            account_id: row.account_id,
            name: row.name,
            shift_class: row.shift_class,
            is_driver: row.is_driver,
            punch_date: row.punch_date,
            punch_records: []
          });
        }
        grouped.get(key).punch_records.push({ time: row.punch_time, machine_id: row.machine_id || '' });
      });

      // 3. Deduplicate punch times + sort
      const integratedPunchData = Array.from(grouped.values()).map(row => {
        const seen = new Set<string>();
        const uniqueRecords = row.punch_records
          .filter((r: any) => {
            const k = `${r.time}_${r.machine_id}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .sort((a: any, b: any) => a.time.localeCompare(b.time));

        return {
          ...row,
          punch_records: uniqueRecords,
          punch_times: uniqueRecords.map((r: any) => r.time),
          machine_ids: Array.from(new Set(uniqueRecords.map((r: any) => r.machine_id).filter(Boolean))) as string[]
        };
      });

      // 4. Collect dates
      const dateSet = new Set(integratedPunchData.map(r => r.punch_date));
      const availableDates = Array.from(dateSet).sort().reverse();

      setStore({
        integratedPunchData,
        availableDates
      });

      addLog(`ETL 整合完成！共生成 ${integratedPunchData.length} 筆整合考勤記錄。`, 'success');
      const minDate = availableDates[availableDates.length - 1];
      const maxDate = availableDates[0];
      const dateRangeStr = minDate && maxDate ? `${minDate} ~ ${maxDate}` : '無';
      addLog(`可用日期範圍: ${dateRangeStr}`, 'success');

      return { success: true, count: integratedPunchData.length, dateRange: dateRangeStr };
    } catch (err: any) {
      addLog(`ETL 整合失敗: ${err.message}`, 'error');
      return { success: false, count: 0, dateRange: '' };
    }
  },

  generateMachineAnomalyReport: () => {
    const { machineList, integratedPunchData, addLog } = getStore();
    if (machineList.length === 0 || integratedPunchData.length === 0) {
      return { success: false, anomalyCount: 0, noShiftCount: 0, unknownCount: 0 };
    }

    addLog('執行機號異常比對...', 'info');

    const machineMap = new Map<string, { location: string; shift_class: string; isShared: boolean; allowed: Set<string> }>();
    machineList.forEach(m => {
      machineMap.set(m.machine_id, {
        location: m.location || '-',
        shift_class: m.shift_class,
        isShared: m.shift_class === '共用',
        allowed: new Set(m.shift_class.split(',').map(s => s.trim()))
      });
    });

    const anomalies: MachineAnomalyRecord[] = [];
    const noShiftRecords: NoShiftPunchRecord[] = [];
    const unknownRecords: UnknownMachineRecord[] = [];

    integratedPunchData.forEach(record => {
      if (!record.punch_records) return;
      if (!record.shift_class || record.shift_class === '未設定班別') {
        record.punch_records.forEach(punch => {
          if (!punch.machine_id) return;
          const machine = machineMap.get(punch.machine_id);
          noShiftRecords.push({
            key: record.account_id || record.emp_id || record.name,
            emp_id: record.emp_id,
            account_id: record.account_id,
            name: record.name,
            date: record.punch_date,
            time: punch.time,
            machine_id: punch.machine_id,
            machine_location: machine ? machine.location : '-'
          });
        });
        return;
      }
      record.punch_records.forEach(punch => {
        if (!punch.machine_id) return;
        const machine = machineMap.get(punch.machine_id);
        if (!machine) {
          unknownRecords.push({
            emp_id: record.emp_id,
            account_id: record.account_id,
            name: record.name,
            shift_class: record.shift_class,
            date: record.punch_date,
            time: punch.time,
            machine_id: punch.machine_id
          });
          return;
        }
        if (machine.isShared) return;
        if (machine.allowed.has(record.shift_class)) return;

        anomalies.push({
          emp_id: record.emp_id,
          name: record.name,
          shift_class: record.shift_class,
          date: record.punch_date,
          time: punch.time,
          machine_id: punch.machine_id,
          machine_location: machine.location,
          machine_allowed: machine.shift_class
        });
      });
    });

    anomalies.sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      (a.shift_class || '').localeCompare(b.shift_class || '') ||
      (a.emp_id || '').localeCompare(b.emp_id || '')
    );

    setStore({
      lastAnomalyData: anomalies,
      lastNoShiftData: noShiftRecords,
      lastUnknownMachineData: unknownRecords
    });

    addLog(`比對完成，發現 ${anomalies.length} 筆跨班異常、${unknownRecords.length} 筆未登記機台刷卡。`, anomalies.length > 0 || unknownRecords.length > 0 ? 'warning' : 'success');
    return { success: true, anomalyCount: anomalies.length, noShiftCount: noShiftRecords.length, unknownCount: unknownRecords.length };
  }
}));
