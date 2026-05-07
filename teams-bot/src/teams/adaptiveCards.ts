import type { ParkingSession, ParkingStatus, PriorityUser } from "../domain/parking";

export type ParkingCardAction =
  | "check_in"
  | "check_out"
  | "refresh"
  | "admin_occupy"
  | "admin_release";

interface ParkingStatusCardOptions {
  notice?: string;
  showAdminControls: boolean;
  defaultPriorityLabels: string[];
  timeZone: string;
}

type AdaptiveCard = Record<string, unknown>;

export function buildParkingStatusCard(
  status: ParkingStatus,
  options: ParkingStatusCardOptions
): AdaptiveCard {
  const priorityLabels = uniqueLabels([
    ...status.priorityUsers.map((user) => user.label),
    ...options.defaultPriorityLabels
  ]);

  return {
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "BISCAT 주차 현황",
        weight: "Bolder",
        size: "Large",
        wrap: true
      },
      ...(options.notice
        ? [
            {
              type: "TextBlock",
              text: options.notice,
              wrap: true,
              color: status.available > 0 ? "Good" : "Attention"
            }
          ]
        : []),
      {
        type: "FactSet",
        facts: [
          { title: "총 주차 가능", value: `${status.total}대` },
          { title: "사용 중", value: `${status.used}대` },
          { title: "남은 자리", value: `${status.available}대` }
        ]
      },
      {
        type: "TextBlock",
        text: "자리별 상태",
        weight: "Bolder",
        spacing: "Medium",
        wrap: true
      },
      ...status.slots.map((slot) => ({
        type: "Container",
        separator: true,
        spacing: "Small",
        items: [
          {
            type: "ColumnSet",
            columns: [
              {
                type: "Column",
                width: "auto",
                items: [
                  {
                    type: "TextBlock",
                    text: `${slot.slotNo}번`,
                    weight: "Bolder",
                    wrap: true
                  }
                ]
              },
              {
                type: "Column",
                width: "stretch",
                items: [
                  {
                    type: "TextBlock",
                    text: formatSlotTitle(slot.session, status.priorityUsers),
                    color: slot.session ? "Attention" : "Good",
                    wrap: true
                  },
                  {
                    type: "TextBlock",
                    text: formatSlotDetail(slot.session, options.timeZone),
                    isSubtle: true,
                    size: "Small",
                    wrap: true
                  }
                ]
              }
            ]
          }
        ]
      })),
      {
        type: "TextBlock",
        text: `우선 사용자: ${priorityLabels.join(", ")}`,
        isSubtle: true,
        size: "Small",
        spacing: "Medium",
        wrap: true
      },
      {
        type: "TextBlock",
        text: `업데이트: ${formatTime(status.updatedAt, options.timeZone)}`,
        isSubtle: true,
        size: "Small",
        wrap: true
      },
      ...(options.showAdminControls ? [buildAdminControls()] : [])
    ],
    actions: [
      submitAction("체크인", "check_in"),
      submitAction("체크아웃", "check_out"),
      submitAction("새로고침", "refresh")
    ]
  };
}

function buildAdminControls(): AdaptiveCard {
  return {
    type: "Container",
    separator: true,
    spacing: "Medium",
    items: [
      {
        type: "TextBlock",
        text: "관리자",
        weight: "Bolder",
        wrap: true
      },
      {
        type: "ActionSet",
        actions: [
          submitAction("1번 점유", "admin_occupy", 1),
          submitAction("1번 해제", "admin_release", 1),
          submitAction("2번 점유", "admin_occupy", 2),
          submitAction("2번 해제", "admin_release", 2)
        ]
      }
    ]
  };
}

function submitAction(title: string, action: ParkingCardAction, slotNo?: number): AdaptiveCard {
  return {
    type: "Action.Submit",
    title,
    data: {
      action,
      ...(slotNo ? { slotNo } : {})
    }
  };
}

function formatSlotTitle(session: ParkingSession | null, priorityUsers: PriorityUser[]): string {
  if (!session) {
    return "비어 있음";
  }

  if (session.checkInType === "manual") {
    return "관리자 점유";
  }

  const priorityUser = priorityUsers.find((user) => user.userId === session.userId);

  if (priorityUser) {
    return `${priorityUser.label} 사용 중`;
  }

  return `${session.userName} 사용 중`;
}

function formatSlotDetail(session: ParkingSession | null, timeZone: string): string {
  if (!session) {
    return "지금 체크인할 수 있습니다.";
  }

  return `체크인 ${formatTime(session.checkedInAt, timeZone)}`;
}

function formatTime(isoDate: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoDate));
}

function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}
