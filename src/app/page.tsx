"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const EMPLOYEE_LIST = [
  "고동욱",
  "최병훈",
  "정기홍",
  "이현아",
  "엄진영",
  "이송우",
  "이영신",
  "김정기",
  "백지연",
  "이준혁",
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MOBILE_WEEKDAYS = ["월", "화", "수", "목", "금"];

const TIME_SLOTS = [
  { value: "morning", label: "오전" },
  { value: "afternoon", label: "오후" },
  { value: "full_day", label: "종일" },
] as const;

type TimeSlot = "morning" | "afternoon" | "full_day";
type ActionType = "reserve" | "cancel";

type ParkingReservation = {
  id: string;
  employee_name: string;
  reserved_date: string;
  spot_no: number;
  time_slot: TimeSlot;
  created_at: string;
};

type ParkingLog = {
  id: string;
  message: string;
  action_type?: ActionType;
  employee_name?: string;
  target_date?: string;
  time_slot?: TimeSlot;
  spot_no?: number;
  created_at: string;
};

type Toast = {
  message: string;
  type: "success" | "error";
};

type CalendarDay = {
  date: string;
  dayNumber: number;
  monthLabel: string;
  isToday: boolean;
  isCurrentRange: boolean;
};

export default function Home() {
  const [reservationName, setReservationName] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedTimeSlot, setSelectedTimeSlot] =
    useState<TimeSlot>("full_day");

  const [reservations, setReservations] = useState<ParkingReservation[]>([]);
  const [calendarReservations, setCalendarReservations] = useState<
    ParkingReservation[]
  >([]);
  const [logs, setLogs] = useState<ParkingLog[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);

  const calendarDays = useMemo(() => getFourWeekCalendarDays(), []);
  const mobileCalendarDays = useMemo(() => getCurrentWorkWeekDays(), []);

  useEffect(() => {
    refreshAll();

    const reservationsChannel = supabase
      .channel("parking-reservations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_reservations",
        },
        () => {
          refreshAll();
        },
      )
      .subscribe();

    const logsChannel = supabase
      .channel("parking-logs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_logs",
        },
        () => {
          fetchLogs();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reservationsChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [selectedDate]);

  async function refreshAll() {
    await fetchReservations(selectedDate);
    await fetchCalendarReservations();
    await fetchLogs();
  }

  async function fetchReservations(date: string) {
    const { data, error } = await supabase
      .from("parking_reservations")
      .select("*")
      .eq("reserved_date", date)
      .order("spot_no")
      .order("time_slot");

    if (error) {
      showToast("예약 데이터를 불러오지 못했습니다.", "error");
      return;
    }

    setReservations((data || []) as ParkingReservation[]);
  }

  async function fetchCalendarReservations() {
    const days = getFourWeekCalendarDays();
    const startDate = days[0].date;
    const endDate = days[days.length - 1].date;

    const { data, error } = await supabase
      .from("parking_reservations")
      .select("*")
      .gte("reserved_date", startDate)
      .lte("reserved_date", endDate)
      .order("reserved_date")
      .order("spot_no")
      .order("time_slot");

    if (error) {
      showToast("달력 데이터를 불러오지 못했습니다.", "error");
      return;
    }

    setCalendarReservations((data || []) as ParkingReservation[]);
  }

  async function fetchLogs() {
    const { data, error } = await supabase
      .from("parking_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return;
    }

    setLogs((data || []) as ParkingLog[]);
  }

  function showToast(
    message: string,
    type: "success" | "error" = "success",
  ) {
    setToast({ message, type });

    window.setTimeout(() => {
      setToast(null);
    }, 2600);
  }

  function isTimeConflict(existing: TimeSlot, incoming: TimeSlot) {
    if (existing === "full_day" || incoming === "full_day") {
      return true;
    }

    return existing === incoming;
  }

  function findAvailableSpot(
    dateReservations: ParkingReservation[],
    timeSlot: TimeSlot,
  ) {
    for (const spotNo of [1, 2]) {
      const spotReservations = dateReservations.filter(
        (reservation) => reservation.spot_no === spotNo,
      );

      const hasConflict = spotReservations.some((reservation) =>
        isTimeConflict(reservation.time_slot, timeSlot),
      );

      if (!hasConflict) {
        return spotNo;
      }
    }

    return null;
  }

  const availableEmployees = EMPLOYEE_LIST.filter(
    (employee) =>
      !reservations.some(
        (reservation) =>
          reservation.employee_name === employee &&
          isTimeConflict(reservation.time_slot, selectedTimeSlot),
      ),
  );

  async function createLog(
    message: string,
    actionType: ActionType,
    employeeName: string,
    targetDate?: string,
    timeSlot?: TimeSlot,
    spotNo?: number,
  ) {
    const { error } = await supabase.from("parking_logs").insert({
      message,
      action_type: actionType,
      employee_name: employeeName,
      target_date: targetDate,
      time_slot: timeSlot,
      spot_no: spotNo,
    });

    if (error) {
      showToast(`로그 저장 실패: ${error.message}`, "error");
      return;
    }

    await fetchLogs();
  }

  async function handleReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reservationName) {
      showToast("직원을 선택해주세요.", "error");
      return;
    }

    const availableSpot = findAvailableSpot(
      reservations,
      selectedTimeSlot,
    );

    if (!availableSpot) {
      showToast("예약 가능한 자리가 없습니다.", "error");
      return;
    }

    const { error } = await supabase
      .from("parking_reservations")
      .insert({
        employee_name: reservationName,
        reserved_date: selectedDate,
        spot_no: availableSpot,
        time_slot: selectedTimeSlot,
      });

    if (error) {
      showToast("예약 실패", "error");
      return;
    }

    await createLog(
      `${reservationName}님이 ${formatDate(
        selectedDate,
      )} ${getTimeSlotLabel(
        selectedTimeSlot,
      )} ${availableSpot}번 자리를 예약했습니다.`,
      "reserve",
      reservationName,
      selectedDate,
      selectedTimeSlot,
      availableSpot,
    );

    await refreshAll();

    showToast("예약 완료");
    setReservationName("");
  }

  async function handleCancelReservation(reservation: ParkingReservation) {
    const ok = window.confirm(
      `${reservation.employee_name}님의 ${formatDate(
        reservation.reserved_date,
      )} ${getTimeSlotLabel(reservation.time_slot)} 예약을 취소할까요?`,
    );

    if (!ok) {
      return;
    }

    const { error } = await supabase
      .from("parking_reservations")
      .delete()
      .eq("id", reservation.id);

    if (error) {
      showToast("예약 취소 실패", "error");
      return;
    }

    await createLog(
      `${reservation.employee_name}님의 ${formatDate(
        reservation.reserved_date,
      )} ${getTimeSlotLabel(reservation.time_slot)} 예약이 취소되었습니다.`,
      "cancel",
      reservation.employee_name,
      reservation.reserved_date,
      reservation.time_slot,
      reservation.spot_no,
    );

    await refreshAll();

    showToast("예약을 취소했습니다.");
  }

  function renderCalendar(dayList: CalendarDay[], isMobile: boolean) {
    return (
      <div
        className={
          isMobile
            ? "grid grid-cols-1 gap-2"
            : "grid min-h-0 flex-1 grid-cols-7 grid-rows-4 gap-2 overflow-hidden"
        }
      >
        {dayList.map((day) => {
          const dayReservations = calendarReservations.filter(
            (reservation) => reservation.reserved_date === day.date,
          );

          const isSelected = selectedDate === day.date;

          return (
            <div
              key={day.date}
              role="button"
              tabIndex={day.isCurrentRange ? 0 : -1}
              onClick={() => {
                if (!day.isCurrentRange) return;
                setSelectedDate(day.date);
              }}
              onKeyDown={(event) => {
                if (!day.isCurrentRange) return;

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedDate(day.date);
                }
              }}
              className={`flex min-h-[132px] flex-col rounded-2xl border p-2 text-left transition lg:min-h-0 ${
                isSelected
                  ? "border-slate-950 bg-slate-950 text-white"
                  : day.isCurrentRange
                    ? "cursor-pointer border-slate-200 bg-white hover:border-slate-400"
                    : "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold">
                    {isMobile
                      ? `${day.monthLabel} ${day.dayNumber}일`
                      : day.dayNumber}
                  </p>
                  <p className="text-[10px] opacity-60">
                    {isMobile ? getWeekdayLabel(day.date) : day.monthLabel}
                  </p>
                </div>

                {day.isToday && (
                  <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    오늘
                  </span>
                )}
              </div>

              <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1">
                {renderSlotCells(dayReservations).map((cell) => {
                  if (!cell.reservation) {
                    return (
                      <div
                        key={cell.key}
                        className={`rounded-lg border border-dashed px-1.5 py-1 text-[10px] leading-tight ${
                          isSelected
                            ? "border-white/15 bg-white/5 text-white/30"
                            : "border-slate-200 bg-slate-50 text-slate-300"
                        } ${cell.className}`}
                      >
                        <p>{cell.label}</p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={cell.key}
                      className={`group relative overflow-hidden rounded-lg px-1.5 py-1 text-[10px] leading-tight ${
                        isSelected
                          ? "bg-white/10 text-white"
                          : "bg-slate-100 text-slate-800"
                      } ${cell.className}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="font-bold">{cell.label}</p>
                          <p className="truncate">
                            {cell.reservation.employee_name}
                          </p>
                          <p className="text-[9px] opacity-60">
                            {cell.reservation.spot_no}번
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCancelReservation(cell.reservation!);
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                            isSelected
                              ? "bg-white/10 hover:bg-white/20"
                              : "bg-white hover:bg-rose-50 hover:text-rose-600"
                          }`}
                          aria-label="예약 취소"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-[#f4f6f8] p-3 text-slate-950 lg:h-screen lg:overflow-hidden lg:p-4">
      <div className="grid min-h-screen gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[7fr_3fr]">
        <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold lg:text-2xl">주차 예약 현황</h1>
              <p className="mt-1 text-sm text-slate-500">
                달력에서 예약을 확인하고, 예약 칩의 × 버튼으로 취소할 수 있습니다.
              </p>
            </div>

            <div className="w-fit rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              총 예약 {calendarReservations.length}건
            </div>
          </div>

          <div className="hidden grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500 lg:grid">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-2">
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-2 text-center text-xs font-semibold text-slate-500 lg:hidden">
            {MOBILE_WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-2">
                {weekday}
              </div>
            ))}
          </div>

          <div className="hidden min-h-0 flex-1 lg:flex">
            <div className="flex min-h-0 flex-1">
              {renderCalendar(calendarDays, false)}
            </div>
          </div>

          <div className="lg:hidden">
            {renderCalendar(mobileCalendarDays, true)}
          </div>
        </section>

        <aside className="grid min-h-0 gap-4 lg:grid-rows-[auto_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
            <div>
              <h2 className="text-lg font-bold">예약</h2>
              <p className="mt-1 text-sm text-slate-500">
                날짜와 시간대를 선택하세요.
              </p>
            </div>

            <form onSubmit={handleReservation} className="mt-5 space-y-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 px-3"
              />

              <select
                value={selectedTimeSlot}
                onChange={(event) =>
                  setSelectedTimeSlot(event.target.value as TimeSlot)
                }
                className="h-12 w-full rounded-xl border border-slate-300 px-3"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>

              <select
                value={reservationName}
                onChange={(event) => setReservationName(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 px-3"
              >
                <option value="">직원 선택</option>

                {availableEmployees.map((employee) => (
                  <option key={employee} value={employee}>
                    {employee}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white"
              >
                예약하기
              </button>
            </form>
          </section>

          <section className="flex min-h-[320px] flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:min-h-0 lg:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-bold">최근 활동</h2>
              <p className="mt-1 text-sm text-slate-500">
                예약 및 취소 기록
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
                  아직 활동 기록이 없습니다.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {log.message}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(log.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-5 right-5 z-50 lg:left-auto">
          <div
            className={`rounded-2xl px-5 py-4 text-sm font-medium shadow-lg ${
              toast.type === "success"
                ? "bg-slate-950 text-white"
                : "bg-rose-500 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </main>
  );
}

function renderSlotCells(reservations: ParkingReservation[]) {
  const spot1FullDay = reservations.find(
    (reservation) =>
      reservation.spot_no === 1 && reservation.time_slot === "full_day",
  );

  const spot2FullDay = reservations.find(
    (reservation) =>
      reservation.spot_no === 2 && reservation.time_slot === "full_day",
  );

  const spot1Morning = reservations.find(
    (reservation) =>
      reservation.spot_no === 1 && reservation.time_slot === "morning",
  );

  const spot1Afternoon = reservations.find(
    (reservation) =>
      reservation.spot_no === 1 && reservation.time_slot === "afternoon",
  );

  const spot2Morning = reservations.find(
    (reservation) =>
      reservation.spot_no === 2 && reservation.time_slot === "morning",
  );

  const spot2Afternoon = reservations.find(
    (reservation) =>
      reservation.spot_no === 2 && reservation.time_slot === "afternoon",
  );

  return [
    {
      key: "spot1-morning",
      label: spot1FullDay ? "1종일" : "1오전",
      reservation: spot1FullDay ?? spot1Morning ?? null,
      className: spot1FullDay
        ? "row-span-2 row-start-1 col-start-1"
        : "row-start-1 col-start-1",
    },
    {
      key: "spot2-morning",
      label: spot2FullDay ? "2종일" : "2오전",
      reservation: spot2FullDay ?? spot2Morning ?? null,
      className: spot2FullDay
        ? "row-span-2 row-start-1 col-start-2"
        : "row-start-1 col-start-2",
    },
    {
      key: "spot1-afternoon",
      label: "1오후",
      reservation: spot1FullDay ? null : spot1Afternoon ?? null,
      className: spot1FullDay ? "hidden" : "row-start-2 col-start-1",
    },
    {
      key: "spot2-afternoon",
      label: "2오후",
      reservation: spot2FullDay ? null : spot2Afternoon ?? null,
      className: spot2FullDay ? "hidden" : "row-start-2 col-start-2",
    },
  ];
}

function getTimeSlotLabel(slot: TimeSlot) {
  switch (slot) {
    case "morning":
      return "오전";
    case "afternoon":
      return "오후";
    case "full_day":
      return "종일";
    default:
      return "";
  }
}

function getTodayString() {
  return toDateString(new Date());
}

function getFourWeekCalendarDays() {
  const today = new Date();
  const todayString = toDateString(today);
  const start = new Date(today);

  start.setDate(today.getDate() - today.getDay());

  return Array.from({ length: 28 }, (_, index) => {
    const date = new Date(start);

    date.setDate(start.getDate() + index);

    const dateString = toDateString(date);

    return {
      date: dateString,
      dayNumber: date.getDate(),
      monthLabel: new Intl.DateTimeFormat("ko-KR", {
        month: "short",
      }).format(date),
      isToday: dateString === todayString,
      isCurrentRange: dateString >= todayString,
    };
  });
}

function getCurrentWorkWeekDays() {
  const today = new Date();
  const todayString = toDateString(today);
  const monday = new Date(today);
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  monday.setDate(today.getDate() + diffToMonday);

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);

    date.setDate(monday.getDate() + index);

    const dateString = toDateString(date);

    return {
      date: dateString,
      dayNumber: date.getDate(),
      monthLabel: new Intl.DateTimeFormat("ko-KR", {
        month: "short",
      }).format(date),
      isToday: dateString === todayString,
      isCurrentRange: dateString >= todayString,
    };
  });
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function getWeekdayLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
  }).format(new Date(date));
}