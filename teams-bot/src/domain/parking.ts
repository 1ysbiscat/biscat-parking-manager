export const PARKING_CAPACITY = 2;
export const SLOT_NUMBERS = [1, 2] as const;

export type SlotNo = (typeof SLOT_NUMBERS)[number];
export type ParkingSessionStatus = "checked_in" | "checked_out";
export type CheckInType = "user" | "manual";

export interface ParkingUser {
  userId: string;
  userName: string;
}

export interface PriorityUser {
  userId?: string;
  label: string;
  role?: string;
}

export interface ParkingSession {
  id: string;
  userId: string;
  userName: string;
  slotNo: SlotNo;
  status: ParkingSessionStatus;
  checkInType: CheckInType;
  checkedInAt: string;
  checkedOutAt: string | null;
  createdAt: string;
  createdBy: string | null;
  checkedOutBy: string | null;
  note: string | null;
}

export interface ParkingSlotStatus {
  slotNo: SlotNo;
  session: ParkingSession | null;
}

export interface ParkingStatus {
  total: number;
  used: number;
  available: number;
  slots: ParkingSlotStatus[];
  activeSessions: ParkingSession[];
  priorityUsers: PriorityUser[];
  updatedAt: string;
}

export interface ParkingActionResult {
  ok: boolean;
  message: string;
  status: ParkingStatus;
}

export function isSlotNo(value: number): value is SlotNo {
  return SLOT_NUMBERS.includes(value as SlotNo);
}

export function getFirstAvailableSlot(activeSessions: ParkingSession[]): SlotNo | null {
  const usedSlots = new Set(activeSessions.map((session) => session.slotNo));
  return SLOT_NUMBERS.find((slotNo) => !usedSlots.has(slotNo)) ?? null;
}
