import type { CheckInType, ParkingSession, SlotNo } from "../domain/parking";

export interface CreateParkingSessionInput {
  userId: string;
  userName: string;
  slotNo: SlotNo;
  checkInType: CheckInType;
  createdBy?: string;
  note?: string;
}

export interface ParkingRepository {
  listActiveSessions(): Promise<ParkingSession[]>;
  findActiveSessionByUser(userId: string): Promise<ParkingSession | null>;
  findActiveSessionBySlot(slotNo: SlotNo): Promise<ParkingSession | null>;
  createSession(input: CreateParkingSessionInput): Promise<ParkingSession>;
  checkOutUser(userId: string, checkedOutBy: string): Promise<ParkingSession[]>;
  checkOutSlot(slotNo: SlotNo, checkedOutBy: string): Promise<ParkingSession[]>;
  checkOutAll(checkedOutBy: string, note?: string): Promise<ParkingSession[]>;
  getState<T>(key: string): Promise<T | null>;
  upsertState<T>(key: string, value: T): Promise<void>;
}

export class ParkingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParkingConflictError";
  }
}
