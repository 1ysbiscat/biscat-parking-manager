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

export default function Home() {
  const [employeeName, setEmployeeName] = useState("");
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [message, setMessage] = useState("주차할 직원을 선택해주세요.");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();

    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  const usedSpots = sessions.length;
  const remainingSpots = TOTAL_SPOTS - usedSpots;
  const isFull = remainingSpots === 0;

  const occupiedSpotNumbers = new Set(
    sessions.map((session) => session.spot_no),
  );

  const availableEmployees = EMPLOYEE_LIST.filter(
    (employee) =>
      !sessions.some(
        (session) =>
          normalizeName(session.employee_name) === normalizeName(employee),
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
  const { data, error } = await supabase
    .from("parking_sessions")
    .insert({
      employee_name: employeeName,
      spot_no: nextSpot,
    })
    .select();

  if (error) {
    console.error("Supabase insert error raw:", error);
    console.error("Supabase insert error message:", error.message);
    console.error("Supabase insert error json:", JSON.stringify(error, null, 2));

    setMessage(`체크인 오류: ${error.message || "Supabase 저장 실패"}`);
    return;
  }
await fetchSessions();
setEmployeeName("");
setMessage(`${employeeName}님 체크인 완료`);
  console.log("Supabase insert success:", data);
} catch (error) {
  console.error("Unexpected insert error:", error);
  setMessage("예상치 못한 체크인 오류가 발생했습니다.");
  return;
}

    setEmployeeName("");
    setMessage(`${employeeName}님 체크인 완료`);
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

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5">

        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">

          <div className="flex items-center justify-between">

            <div>
              <p className="text-sm font-medium text-slate-500">
                BISCAT OFFICE
              </p>

              <h1 className="mt-1 text-3xl font-semibold">
                주차 현황
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                총 2대 중 {usedSpots}대 사용 중
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
                spot.session
                  ? "bg-slate-950 text-white"
                  : "bg-white"
              }`}
            >
              <div className="flex items-start justify-between">

                <div>
                  <p className="text-sm opacity-70">
                    {spot.spotNo}번 자리
                  </p>

                  <h2 className="mt-3 text-3xl font-semibold">
                    {spot.session
                      ? spot.session.employee_name
                      : "비어있음"}
                  </h2>
                </div>

                {spot.session && (
                  <button
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
                    <p>
                      입차 시간{" "}
                      {formatTime(spot.session.checked_in_at)}
                    </p>

                    <p>
                      차량번호{" "}
                      {spot.session.car_number || "미등록"}
                    </p>
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

          <h2 className="text-lg font-semibold">
            체크인
          </h2>

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
                {isFull
                  ? "현재 만차입니다"
                  : "직원을 선택하세요"}
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
            onClick={handleReset}
            className="mt-4 text-sm font-semibold text-rose-600"
          >
            전체 초기화
          </button>
        </section>
      </div>
    </main>
  );
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function formatTime(isoDate: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}