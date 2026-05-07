import {
  PARKING_CAPACITY,
  SLOT_NUMBERS,
  getFirstAvailableSlot,
  type ParkingActionResult,
  type ParkingSession,
  type ParkingStatus,
  type ParkingUser,
  type PriorityUser,
  type SlotNo
} from "../domain/parking";
import { ParkingConflictError, type ParkingRepository } from "../repositories/parkingRepository";

export interface ParkingServiceOptions {
  priorityUsers: PriorityUser[];
}

export class ParkingService {
  constructor(
    private readonly repository: ParkingRepository,
    private readonly options: ParkingServiceOptions
  ) {}

  async getStatus(): Promise<ParkingStatus> {
    const activeSessions = await this.repository.listActiveSessions();

    return {
      total: PARKING_CAPACITY,
      used: activeSessions.length,
      available: Math.max(PARKING_CAPACITY - activeSessions.length, 0),
      activeSessions,
      slots: SLOT_NUMBERS.map((slotNo) => ({
        slotNo,
        session: activeSessions.find((session) => session.slotNo === slotNo) ?? null
      })),
      priorityUsers: this.options.priorityUsers,
      updatedAt: new Date().toISOString()
    };
  }

  async checkIn(user: ParkingUser): Promise<ParkingActionResult> {
    const existing = await this.repository.findActiveSessionByUser(user.userId);

    if (existing) {
      return this.result(false, `${existing.slotNo}번 자리에 이미 체크인되어 있습니다.`);
    }

    for (let attempt = 0; attempt < PARKING_CAPACITY; attempt += 1) {
      const status = await this.getStatus();

      if (status.used >= PARKING_CAPACITY) {
        return this.result(false, "현재 주차 공간이 모두 사용 중입니다.");
      }

      const slotNo = getFirstAvailableSlot(status.activeSessions);

      if (!slotNo) {
        return this.result(false, "사용 가능한 주차 자리가 없습니다.");
      }

      try {
        await this.repository.createSession({
          userId: user.userId,
          userName: user.userName,
          slotNo,
          checkInType: "user",
          createdBy: user.userId
        });

        return this.result(true, `${slotNo}번 자리에 체크인했습니다.`);
      } catch (error) {
        if (error instanceof ParkingConflictError) {
          continue;
        }

        throw error;
      }
    }

    return this.result(false, "방금 다른 사용자가 먼저 체크인했습니다. 새로고침 후 다시 시도해 주세요.");
  }

  async checkOut(user: ParkingUser): Promise<ParkingActionResult> {
    const activeSession = await this.repository.findActiveSessionByUser(user.userId);

    if (!activeSession) {
      return this.result(false, "현재 체크인된 차량이 없습니다.");
    }

    await this.repository.checkOutUser(user.userId, user.userId);
    return this.result(true, `${activeSession.slotNo}번 자리에서 체크아웃했습니다.`);
  }

  async manualOccupySlot(slotNo: SlotNo, admin: ParkingUser): Promise<ParkingActionResult> {
    const activeSession = await this.repository.findActiveSessionBySlot(slotNo);

    if (activeSession) {
      return this.result(false, `${slotNo}번 자리는 이미 사용 중입니다.`);
    }

    try {
      await this.repository.createSession({
        userId: `manual-slot-${slotNo}`,
        userName: `관리자 점유 (${slotNo}번)`,
        slotNo,
        checkInType: "manual",
        createdBy: admin.userId,
        note: `Manual hold by ${admin.userName}`
      });
    } catch (error) {
      if (error instanceof ParkingConflictError) {
        return this.result(false, `${slotNo}번 자리는 방금 사용 중으로 바뀌었습니다.`);
      }

      throw error;
    }

    return this.result(true, `${slotNo}번 자리를 관리자 점유로 표시했습니다.`);
  }

  async releaseSlot(slotNo: SlotNo, admin: ParkingUser): Promise<ParkingActionResult> {
    const activeSession = await this.repository.findActiveSessionBySlot(slotNo);

    if (!activeSession) {
      return this.result(false, `${slotNo}번 자리는 이미 비어 있습니다.`);
    }

    await this.repository.checkOutSlot(slotNo, admin.userId);
    return this.result(true, `${slotNo}번 자리를 해제했습니다.`);
  }

  async closeAllOpenSessions(checkedOutBy: string, note: string): Promise<ParkingSession[]> {
    return this.repository.checkOutAll(checkedOutBy, note);
  }

  private async result(ok: boolean, message: string): Promise<ParkingActionResult> {
    return {
      ok,
      message,
      status: await this.getStatus()
    };
  }
}
