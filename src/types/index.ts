export interface Employee {
  emp_id: string;
  name: string;
  shift_class: string;
  account_id?: string;
  is_driver: boolean;
}

export interface Machine {
  machine_id: string;
  location: string;
  shift_class: string;
}

export interface PunchRecord {
  seq_no?: number;
  account_id: string;
  id_number?: string;
  name: string;
  punch_date: string;
  punch_time: string;
  punch_type?: string;
  machine_id?: string;
  location?: string;
  [key: string]: any; // Allow indexing
}

export interface LeaveRecord {
  emp_id: string;
  name: string;
  leave_type: string;
  source_text: string;
  leave_day: number;
  date: string;
  full_date: string;
  weekday_zh: string;
}

export interface IntegratedPunchRecord {
  time: string;
  machine_id: string;
  location?: string;
}

export interface IntegratedRecord {
  emp_id: string;
  account_id: string;
  name: string;
  shift_class: string;
  is_driver: boolean;
  punch_date: string;
  punch_records: IntegratedPunchRecord[];
  punch_times: string[];
  machine_ids: string[];
}

export interface SystemLog {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface MachineAnomalyRecord {
  emp_id: string;
  name: string;
  shift_class: string;
  date: string;
  time: string;
  machine_id: string;
  machine_location: string;
  machine_allowed: string;
}

export interface NoShiftPunchRecord {
  key: string;
  emp_id: string;
  account_id: string;
  name: string;
  date: string;
  time: string;
  machine_id: string;
  machine_location: string;
}

export interface UnknownMachineRecord {
  emp_id: string;
  account_id: string;
  name: string;
  shift_class: string;
  date: string;
  time: string;
  machine_id: string;
  raw_location: string;
}
