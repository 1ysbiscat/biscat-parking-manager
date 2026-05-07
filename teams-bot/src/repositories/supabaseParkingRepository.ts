import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSlotNo,
  type CheckInType,
  type ParkingSession,
  type ParkingSessionStatus,
  type SlotNo
} from "../domain/parking";
import {
  ParkingConflictError,
  type CreateParkingSessionInput,
  type ParkingRepository
} from "./parkingRepository";

type ParkingSessionRow = {
  id: string;
  user_id: string;
  user_name: string;
  slot_no: number;
  status: ParkingSessionStatus;
  checkin_type: CheckInType;
  checked_in_at: string;
  checked_out_at: string | null;
  created_at: string;
  created_by: string | null;
  checked_out_by: string | null;
  note: string | null;
};

type ParkingBotStateRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      parking_sessions: {
        Row: ParkingSessionRow;
        Insert: Partial<ParkingSessionRow> &
          Pick<ParkingSessionRow, "user_id" | "user_name" | "slot_no" | "status" | "checkin_type">;
        Update: Partial<ParkingSessionRow>;
      };
      parking_bot_state: {
        Row: ParkingBotStateRow;
        Insert: ParkingBotStateRow;
        Update: Partial<ParkingBotStateRow>;
      };
    };
  };
}

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

export class SupabaseParkingRepository implements ParkingRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async listActiveSessions(): Promise<ParkingSession[]> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .select("*")
      .eq("status", "checked_in")
      .order("slot_no", { ascending: true });

    if (error) {
      throw new Error(`Failed to list active parking sessions: ${error.message}`);
    }

    return (data ?? []).map(mapParkingSession);
  }

  async findActiveSessionByUser(userId: string): Promise<ParkingSession | null> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "checked_in")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find active parking session by user: ${error.message}`);
    }

    return data ? mapParkingSession(data) : null;
  }

  async findActiveSessionBySlot(slotNo: SlotNo): Promise<ParkingSession | null> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .select("*")
      .eq("slot_no", slotNo)
      .eq("status", "checked_in")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find active parking session by slot: ${error.message}`);
    }

    return data ? mapParkingSession(data) : null;
  }

  async createSession(input: CreateParkingSessionInput): Promise<ParkingSession> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .insert({
        user_id: input.userId,
        user_name: input.userName,
        slot_no: input.slotNo,
        status: "checked_in",
        checkin_type: input.checkInType,
        created_by: input.createdBy ?? null,
        note: input.note ?? null
      })
      .select("*")
      .single();

    if (error) {
      throw toRepositoryError(error);
    }

    return mapParkingSession(data);
  }

  async checkOutUser(userId: string, checkedOutBy: string): Promise<ParkingSession[]> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: checkedOutBy
      })
      .eq("user_id", userId)
      .eq("status", "checked_in")
      .select("*");

    if (error) {
      throw new Error(`Failed to check out parking session by user: ${error.message}`);
    }

    return (data ?? []).map(mapParkingSession);
  }

  async checkOutSlot(slotNo: SlotNo, checkedOutBy: string): Promise<ParkingSession[]> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: checkedOutBy
      })
      .eq("slot_no", slotNo)
      .eq("status", "checked_in")
      .select("*");

    if (error) {
      throw new Error(`Failed to check out parking session by slot: ${error.message}`);
    }

    return (data ?? []).map(mapParkingSession);
  }

  async checkOutAll(checkedOutBy: string, note?: string): Promise<ParkingSession[]> {
    const { data, error } = await this.supabase
      .from("parking_sessions")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: checkedOutBy,
        note: note ?? null
      })
      .eq("status", "checked_in")
      .select("*");

    if (error) {
      throw new Error(`Failed to check out all parking sessions: ${error.message}`);
    }

    return (data ?? []).map(mapParkingSession);
  }

  async getState<T>(key: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from("parking_bot_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load bot state: ${error.message}`);
    }

    return data ? (data.value as T) : null;
  }

  async upsertState<T>(key: string, value: T): Promise<void> {
    const { error } = await this.supabase.from("parking_bot_state").upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString()
      },
      { onConflict: "key" }
    );

    if (error) {
      throw new Error(`Failed to save bot state: ${error.message}`);
    }
  }
}

function mapParkingSession(row: ParkingSessionRow): ParkingSession {
  if (!isSlotNo(row.slot_no)) {
    throw new Error(`Invalid parking slot number from database: ${row.slot_no}`);
  }

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    slotNo: row.slot_no,
    status: row.status,
    checkInType: row.checkin_type,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    checkedOutBy: row.checked_out_by,
    note: row.note
  };
}

function toRepositoryError(error: SupabaseErrorLike): Error {
  if (error.code === "23505") {
    return new ParkingConflictError(error.message ?? "Parking session conflict");
  }

  return new Error(`Failed to create parking session: ${error.message ?? "Unknown Supabase error"}`);
}
