"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TOTAL_SPOTS = 2;

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

type ParkingSession = {
  id: string;
  employee_name: string;
  spot_no: number;
  checked_in_at: string;
  car_number?: string | null;
};

type ParkingReservation = {
  id: string;
  employee_name: string;
  reserved_date: string;
  spot_no: number;
  car_number?: string | null;
  created_at: string;
};

export default function Home() {
  const [employeeName, setEmployeeName] = useState("");
  const [reservationName, setReservationName] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayString());

  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [reservations, setReservations] = useState<ParkingReservation[]>([]);
  const [twoWeekReservations, setTwoWeekReservations] = useState<ParkingReservation[]>([]);

  const [message, setMessage] = useState("주차할 직원을 선택해주세요.");
  const [reservationMessage, setReservationMessage] =
    useState("날짜와 직원을 선택해 예약할 수 있습니다.");
  const [loading, setLoading] = useState(true);

  const twoWeekDays = useMemo(() => getNextTwoWeeks(), []);

  useEffect(() => {
    fetchSessions();
    fetchReservations(selectedDate);
    fetchTwoWeekReservations();

    const sessionsChannel = supabase
      .channel("parking-sessions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_sessions",
        },
        () => {
          fetchSessions();
        },
      )
      .subscribe();

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
          fetchReservations(selectedDate);
          fetchTwoWeekReservations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(reservationsChannel);
    };
  }, [selectedDate]);

  async function fetchSessions() {
    const { data, error } = await supabase
      .from("parking_sessions")
      .select("*")
      .order("spot_no");

    if (error) {
      console.error(error);
      setMessage("주차 데이터를 불러오지 못했습니다.");
      return;
    }

    setSessions(data || []);
    setLoading(false);
  }

  async function fetchReservations(date: string) {
    const { data, error } = await supabase
      .from("parking_reservations")
      .select("*")
      .eq("reserved_date", date)
      .order("spot_no");

    if (error) {
      console.error(error);
      setReservationMessage("예약 데이터를 불러오지 못했습니다.");
      return;
    }

    setReservations(data || []);
  }

  async function fetchTwoWeekReservations() {
    const days = getNextTwoWeeks();
    const startDate = days[0].date;
    const endDate = days[days.length - 1].date;

    const { data, error } = await supabase
      .from("parking_reservations")
      .select("*")
      .gte("reserved_date", startDate)
      .lte("reserved_date", endDate)
      .order("reserved_date")
      .order("spot_no");

    if (error) {
      console.error(error);
      return;
    }

    setTwoWeekReservations(data || []);
  }

  const usedSpots = sessions.length;
  const remainingSpots = TOTAL_SPOTS - usedSpots;
  const isFull = remainingSpots === 0;

  const occupiedSpotNumbers = new Set(
    sessions.map((session) => session.spot_no),
  );

  const reservedSpotNumbers = new Set(
    reservations.map((reservation) => reservation.spot_no),
  );

  const availableEmployees = EMPLOYEE_LIST.filter(
    (employee) =>
      !sessions.some(
        (session) =>
          normalizeName(session.employee_name) === normalizeName(employee),
      ),
  );

  const availableReservationEmployees = EMPLOYEE_LIST.filter(
    (employee) =>
      !reservations.some(
        (reservation) =>
          normalizeName(reservation.employee_name) === normalizeName(employee),
      ),
  );

  const spotCards = Array.from({ length: TOTAL_SPOTS }, (_, index) => {
    const spotNo = index + 1;

    return {
      spotNo,
      session:
        sessions.find((session) => session.spot_no === spotNo) ?? null,
    };
  });

  const reservationCards = Array.from({ length: TOTAL_SPOTS }, (_, index) => {
    const spotNo = index + 1;

    return {
      spotNo,
      reservation:
        reservations.find((reservation) => reservation.spot_no === spotNo) ??
        null,
    };
  });

  async function handleCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!employeeName) {
      setMessage("직원을 선택해주세요.");
      return;
    }

    if (isFull) {
      setMessage("현재 만차입니다.");
      return;
    }

    const nextSpot = [1, 2].find(
      (spotNo) => !occupiedSpotNumbers.has(spotNo),
    );

    if (!nextSpot) {
      setMessage("빈 자리가 없습니다.");
      return;
    }

    try {
      const { error } = await supabase
        .from("parking_sessions")
        .insert({
          employee_name: employeeName,
          spot_no: nextSpot,
        })
        .select();

      if (error) {
        console.error("Supabase insert error:", error);
        setMessage(`체크인 오류: ${error.message || "Supabase 저장 실패"}`);
        return;
      }

      await fetchSessions();

      setMessage(`${employeeName}님 체크인 완료`);
      setEmployeeName("");
    } catch (error) {
      console.error("Unexpected insert error:", error);
      setMessage("예상치 못한 체크인 오류가 발생했습니다.");
    }
  }

  async function handleCheckOut(id: string, name: string) {
    const { error } = await supabase
      .from("parking_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      setMessage("체크아웃 실패");
      return;
    }

    await fetchSessions();

    setMessage(`${name}님 체크아웃 완료`);
  }

  async function handleReset() {
    if (sessions.length === 0) {
      setMessage("이미 비어있는 상태입니다.");
      return;
    }

    const { error } = await supabase
      .from("parking_sessions")
      .delete()
      .in(
        "id",
        sessions.map((session) => session.id),
      );

    if (error) {
      console.error("Reset error:", error);
      setMessage("전체 초기화 중 오류가 발생했습니다.");
      return;
    }

    await fetchSessions();

    setEmployeeName("");
    setMessage("전체 초기화 완료");
  }

  async function handleReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDate) {
      setReservationMessage("예약 날짜를 선택해주세요.");
      return;
    }

    if (!reservationName) {
      setReservationMessage("예약할 직원을 선택해주세요.");
      return;
    }

    if (reservations.length >= TOTAL_SPOTS) {
      setReservationMessage("선택한 날짜는 이미 예약이 마감되었습니다.");
      return;
    }

    const nextSpot = [1, 2].find(
      (spotNo) => !reservedSpotNumbers.has(spotNo),
    );

    if (!nextSpot) {
      setReservationMessage("예약 가능한 자리가 없습니다.");
      return;
    }

    const { error } = await supabase.from("parking_reservations").insert({
      employee_name: reservationName,
      reserved_date: selectedDate,
      spot_no: nextSpot,
    });

    if (error) {
      console.error("Reservation error:", error);
      setReservationMessage(`예약 실패: ${error.message}`);
      return;
    }

    await fetchReservations(selectedDate);
    await fetchTwoWeekReservations();

    setReservationMessage(
      `${formatDate(selectedDate)} ${reservationName}님 ${nextSpot}번 자리 예약 완료`,
    );
    setReservationName("");
  }

  async function handleCancelReservation(id: string, name: string) {
    const { error } = await supabase
      .from("parking_reservations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      setReservationMessage("예약 취소 실패");
      return;
    }

    await fetchReservations(selectedDate);
    await fetchTwoWeekReservations();

    setReservationMessage(`${name}님 예약을 취소했습니다.`);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                BISCAT OFFICE
              </p>

              <h1 className="mt-1 text-3xl font-semibold">주차 현황</h1>

              <p className="mt-2 text-sm text-slate-500">
                총 2대 중 {usedSpots}대 사용 중 · {remainingSpots}자리 남음
              </p>
            </div>

            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                isFull
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isFull ? "만차" : "주차 가능"}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {spotCards.map((spot) => (
            <div
              key={spot.spotNo}
              className={`relative min-h-[220px] rounded-2xl border p-5 shadow-sm ${
                spot.session ? "bg-slate-950 text-white" : "bg-white"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm opacity-70">{spot.spotNo}번 자리</p>

                  <h2 className="mt-3 text-3xl font-semibold">
                    {spot.session ? spot.session.employee_name : "비어있음"}
                  </h2>
                </div>

                {spot.session && (
                  <button
                    type="button"
                    onClick={() =>
                      handleCheckOut(
                        spot.session!.id,
                        spot.session!.employee_name,
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="mt-10">
                {spot.session ? (
                  <div className="space-y-2 text-sm opacity-80">
                    <p>입차 시간 {formatTime
                    (spot.session.checked_in_at)}</p>
                    <p>차량번호 {spot.session.car_number || "미등록"}</p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-100 px-4 py-5 text-sm text-slate-500">
                    현재 사용 가능한 자리입니다.
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">체크인</h2>

          <form
            onSubmit={handleCheckIn}
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <select
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              disabled={isFull}
              className="h-12 rounded-md border border-slate-300 bg-white px-3"
            >
              <option value="">
                {isFull ? "현재 만차입니다" : "직원을 선택하세요"}
              </option>

              {availableEmployees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={!employeeName || isFull}
              className="h-12 rounded-md bg-slate-950 px-6 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              체크인
            </button>
          </form>

          <div className="mt-5 rounded-md bg-slate-100 px-4 py-3 text-sm">
            {loading ? "불러오는 중..." : message}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="mt-4 text-sm font-semibold text-rose-600"
          >
            전체 초기화
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">예약하기</h2>

            <p className="mt-1 text-sm text-slate-500">
              날짜를 선택하고 해당 날짜의 주차 자리를 예약하세요.
            </p>
          </div>

          <form
            onSubmit={handleReservation}
            className="mt-5 grid gap-3 md:grid-cols-[180px_1fr_auto]"
          >
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setReservationName("");
                setReservationMessage("선택한 날짜의 예약 현황입니다.");
              }}
              className="h-12 rounded-md border border-slate-300 bg-white px-3"
            />

            <select
              value={reservationName}
              onChange={(event) => setReservationName(event.target.value)}
              disabled={reservations.length >= TOTAL_SPOTS}
              className="h-12 rounded-md border border-slate-300 bg-white px-3"
            >
              <option value="">
                {reservations.length >= TOTAL_SPOTS
                  ? "예약 마감"
                  : "예약할 직원을 선택하세요"}
              </option>

              {availableReservationEmployees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={!reservationName || reservations.length >= TOTAL_SPOTS}
              className="h-12 rounded-md bg-slate-950 px-6 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              예약하기
            </button>
          </form>

          <div className="mt-5 rounded-md bg-slate-100 px-4 py-3 text-sm">
            {reservationMessage}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  2주 예약 현황
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  날짜를 클릭하면 해당 날짜 예약으로 이동합니다.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
              {twoWeekDays.map((day) => {
                const dayReservations = twoWeekReservations.filter(
                  (reservation) => reservation.reserved_date === day.date,
                );

                const spot1 = dayReservations.find(
                  (reservation) => reservation.spot_no === 1,
                );

                const spot2 = dayReservations.find(
                  (reservation) => reservation.spot_no === 2,
                );

                const isSelected = selectedDate === day.date;
                const isFullReserved = Boolean(spot1 && spot2);

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day.date);
                      setReservationName("");
                      setReservationMessage(
                        "선택한 날짜의 예약 현황입니다.",
                      );
                    }}
                    className={`rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{day.label}</p>

                      {day.isToday ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isSelected
                              ? "bg-white/15 text-white"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          오늘
                        </span>
                      ) : isFullReserved ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isSelected
                              ? "bg-white/15 text-white"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          마감
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 space-y-1 text-xs">
                      <p
                        className={
                          isSelected
                            ? "text-slate-200"
                            : "text-slate-600"
                        }
                      >
                        1번: {spot1?.employee_name ?? "-"}
                      </p>

                      <p
                        className={
                          isSelected
                            ? "text-slate-200"
                            : "text-slate-600"
                        }
                      >
                        2번: {spot2?.employee_name ?? "-"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {reservationCards.map((item) => (
              <div
                key={item.spotNo}
                className={`rounded-2xl border p-5 ${
                  item.reservation
                    ? "border-slate-300 bg-slate-950 text-white"
                    : "border-dashed border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm opacity-70">
                      {item.spotNo}번 자리
                    </p>

                    <h3 className="mt-2 text-2xl font-semibold">
                      {item.reservation
                        ? item.reservation.employee_name
                        : "예약 없음"}
                    </h3>

                    <p className="mt-2 text-sm opacity-70">
                      {formatDate(selectedDate)}
                    </p>
                  </div>

                  {item.reservation && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCancelReservation(
                          item.reservation!.id,
                          item.reservation!.employee_name,
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function getNextTwoWeeks() {
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date();

    date.setDate(date.getDate() + index);

    const dateString = date.toISOString().slice(0, 10);

    return {
      date: dateString,
      label: new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        weekday: "short",
      }).format(date),
      isToday: index === 0,
    };
  });
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

function formatTime(isoDate: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}