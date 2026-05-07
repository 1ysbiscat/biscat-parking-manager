"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";

const TOTAL_SPOTS = 2;
const STORAGE_KEY = "biscat-parking-dashboard-sessions";
const STORAGE_EVENT = "biscat-parking-dashboard-updated";

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
  name: string;
  role: "직원";
  spotNo: number;
  checkedInAt: string;
  carNumber?: string;
};

const initialSessions: ParkingSession[] = [];

const initialSessionsSnapshot = JSON.stringify(initialSessions);

export default function Home() {
  const [employeeName, setEmployeeName] = useState("");
  const [message, setMessage] = useState("주차할 직원을 선택한 뒤 빈 자리에 체크인하세요.");

  const sessionSnapshot = useSyncExternalStore(
    subscribeToParkingSessions,
    getStoredSessionsSnapshot,
    getServerSessionsSnapshot,
  );

  const sessions = useMemo(() => parseSessionSnapshot(sessionSnapshot), [sessionSnapshot]);

  const normalizedName = normalizeName(employeeName);
  const usedSpots = sessions.length;
  const remainingSpots = TOTAL_SPOTS - usedSpots;
  const isFull = remainingSpots === 0;

  const activeUser = sessions.find(
    (session) => normalizeName(session.name) === normalizedName,
  );

  const occupiedSpotNumbers = new Set(sessions.map((session) => session.spotNo));

  const spotCards = Array.from({ length: TOTAL_SPOTS }, (_, index) => {
    const spotNo = index + 1;

    return {
      spotNo,
      session: sessions.find((session) => session.spotNo === spotNo) ?? null,
    };
  });

  const availableEmployees = EMPLOYEE_LIST.filter(
    (employee) =>
      !sessions.some((session) => normalizeName(session.name) === normalizeName(employee)),
  );

  function handleCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = employeeName.trim();

    if (!cleanName) {
      setMessage("체크인할 직원을 선택해주세요.");
      return;
    }

    if (activeUser) {
      setMessage(`${activeUser.name}님은 이미 ${activeUser.spotNo}번 자리를 사용 중입니다.`);
      return;
    }

    if (isFull) {
      setMessage("현재 만차입니다. 체크아웃 후 다시 시도해주세요.");
      return;
    }

    const nextSpot = [1, 2].find((spotNo) => !occupiedSpotNumbers.has(spotNo));

    if (!nextSpot) {
      setMessage("사용 가능한 주차 자리가 없습니다.");
      return;
    }

    const nextSession: ParkingSession = {
      id: normalizedName,
      name: cleanName,
      role: "직원",
      spotNo: nextSpot,
      checkedInAt: new Date().toISOString(),
    };

    saveSessions([...sessions, nextSession].sort((a, b) => a.spotNo - b.spotNo));

    setEmployeeName("");
    setMessage(`${cleanName}님이 ${nextSpot}번 자리에 체크인했습니다.`);
  }

  function handleCheckOutBySession(session: ParkingSession) {
    saveSessions(sessions.filter((item) => item.id !== session.id));
    setMessage(`${session.name}님이 ${session.spotNo}번 자리에서 체크아웃했습니다.`);
  }

  function handleResetAll() {
    setEmployeeName("");
    saveSessions([]);
    setMessage("모든 주차 상태가 초기화되었습니다.");
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">BISCAT OFFICE</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                주차 현황
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                총 2대 중 {usedSpots}대 사용 중 · {remainingSpots}자리 남음
              </p>
            </div>

            <div
              className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${
                isFull
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200"
              }`}
            >
              {isFull ? "만차" : "주차 가능"}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {spotCards.map((spot) => (
            <ParkingSpotCard
              key={spot.spotNo}
              spotNo={spot.spotNo}
              session={spot.session}
              onCheckOut={handleCheckOutBySession}
            />
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">체크인</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              주차할 직원을 선택하면 빈 자리에 자동 배정됩니다.
            </p>
          </div>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={handleCheckIn}>
            <label className="block">
              <span className="sr-only">직원 선택</span>
              <select
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
                disabled={isFull}
                className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
            </label>

            <button
              type="submit"
              disabled={!employeeName || isFull}
              className="h-12 rounded-md bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              체크인
            </button>
          </form>

          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            {message}
          </div>

          <button
            type="button"
            onClick={handleResetAll}
            className="mt-4 text-sm font-semibold text-slate-500 transition hover:text-rose-600"
          >
            전체 초기화
          </button>
        </section>
      </div>
    </main>
  );
}

function ParkingSpotCard({
  spotNo,
  session,
  onCheckOut,
}: {
  spotNo: number;
  session: ParkingSession | null;
  onCheckOut: (session: ParkingSession) => void;
}) {
  return (
    <div
      className={`relative min-h-[220px] rounded-2xl border p-5 shadow-sm transition ${
        session
          ? "border-slate-300 bg-slate-950 text-white"
          : "border-dashed border-slate-300 bg-white text-slate-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={session ? "text-sm font-semibold text-slate-300" : "text-sm font-semibold text-slate-500"}>
            {spotNo}번 자리
          </p>

          <h2 className="mt-3 text-2xl font-semibold">
            {session ? session.name : "비어있음"}
          </h2>
        </div>

        {session ? (
          <button
            type="button"
            onClick={() => onCheckOut(session)}
            aria-label={`${session.name} 체크아웃`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl font-semibold text-white transition hover:bg-white/20"
          >
            ×
          </button>
        ) : (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            사용 가능
          </span>
        )}
      </div>

      <div className="mt-8">
        {session ? (
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              입차 시간{" "}
              <span className="font-semibold text-white">
                {formatTime(session.checkedInAt)}
              </span>
            </p>
            <p>
              차량번호{" "}
              <span className="font-semibold text-white">
                {session.carNumber ?? "미등록"}
              </span>
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
            체크인하면 이 자리에 사용자 정보가 표시됩니다.
          </div>
        )}
      </div>

      <div className="absolute bottom-5 left-5 right-5">
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            session ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-500"
          }`}
        >
          {session ? "우측 상단 × 버튼으로 체크아웃" : "현재 주차 가능"}
        </div>
      </div>
    </div>
  );
}

function subscribeToParkingSessions(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORAGE_EVENT, onStoreChange);
  };
}

function getStoredSessionsSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) ?? initialSessionsSnapshot;
}

function getServerSessionsSnapshot() {
  return initialSessionsSnapshot;
}

function saveSessions(nextSessions: ParkingSession[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSessions));
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function parseSessionSnapshot(snapshot: string): ParkingSession[] {
  try {
    const parsed = JSON.parse(snapshot) as ParkingSession[];

    return parsed.filter(isParkingSession).slice(0, TOTAL_SPOTS);
  } catch {
    return initialSessions;
  }
}

function isParkingSession(value: ParkingSession) {
  return (
    typeof value?.id === "string" &&
    typeof value.name === "string" &&
    value.role === "직원" &&
    (value.spotNo === 1 || value.spotNo === 2) &&
    typeof value.checkedInAt === "string"
  );
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatTime(isoDate: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}