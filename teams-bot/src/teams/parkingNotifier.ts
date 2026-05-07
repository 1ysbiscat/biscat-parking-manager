import { CardFactory, MessageFactory, type Activity, type CloudAdapter, type TurnContext } from "botbuilder";
import type { AppConfig } from "../config/env";
import { buildParkingStatusCard } from "./adaptiveCards";
import type { TeamsStateStore } from "./teamsStateStore";
import type { ParkingService } from "../services/parkingService";
import { logger } from "../utils/logger";

export interface ParkingNotifierResult {
  ok: boolean;
  message: string;
}

export class ParkingNotifier {
  constructor(
    private readonly adapter: CloudAdapter,
    private readonly parkingService: ParkingService,
    private readonly teamsStateStore: TeamsStateStore,
    private readonly config: AppConfig
  ) {}

  async postDailyStatus(): Promise<ParkingNotifierResult> {
    return this.sendCardToChannel({
      notice: "오늘의 주차 현황입니다.",
      updateLatestMessage: false
    });
  }

  async updateLatestStatus(notice?: string): Promise<ParkingNotifierResult> {
    const state = await this.teamsStateStore.getChannelState();

    if (!state?.latestStatusActivityId) {
      return {
        ok: false,
        message: "아직 업데이트할 Teams 주차 현황 메시지가 없습니다."
      };
    }

    return this.sendCardToChannel({
      notice,
      updateLatestMessage: true,
      activityId: state.latestStatusActivityId
    });
  }

  async runDailyClose(): Promise<ParkingNotifierResult> {
    const statusBeforeClose = await this.parkingService.getStatus();

    if (statusBeforeClose.activeSessions.length === 0) {
      return this.sendCardToChannel({
        notice: "오후 10시 점검 완료: 미체크아웃 차량이 없습니다.",
        updateLatestMessage: true
      });
    }

    if (this.config.scheduler.dailyCloseMode === "auto_checkout") {
      const closedSessions = await this.parkingService.closeAllOpenSessions(
        "system:daily-close",
        "Daily 10 PM automatic checkout"
      );

      return this.sendCardToChannel({
        notice: `오후 10시 자동 체크아웃: ${closedSessions.length}대를 처리했습니다.`,
        updateLatestMessage: true
      });
    }

    const openSessionText = statusBeforeClose.activeSessions
      .map((session) => `${session.slotNo}번 ${session.userName}`)
      .join(", ");

    return this.sendCardToChannel({
      notice: `오후 10시 미체크아웃 차량이 있습니다: ${openSessionText}. 관리자가 확인해 주세요.`,
      updateLatestMessage: true
    });
  }

  private async sendCardToChannel(options: {
    notice?: string;
    updateLatestMessage: boolean;
    activityId?: string;
  }): Promise<ParkingNotifierResult> {
    const state = await this.teamsStateStore.getChannelState();

    if (!state?.conversationReference) {
      return {
        ok: false,
        message: "Teams 채널 정보가 아직 없습니다. 채널에서 bot에게 'parking'을 한 번 보내 주세요."
      };
    }

    const activityIdToUpdate =
      options.activityId ?? (options.updateLatestMessage ? state.latestStatusActivityId : undefined);
    let sentOrUpdatedActivityId = activityIdToUpdate;

    try {
      await this.adapter.continueConversationAsync(
        this.config.microsoft.appId,
        state.conversationReference,
        async (context: TurnContext) => {
          const status = await this.parkingService.getStatus();
          const card = buildParkingStatusCard(status, {
            notice: options.notice,
            showAdminControls: false,
            defaultPriorityLabels: this.config.parking.defaultPriorityLabels,
            timeZone: this.config.scheduler.timeZone
          });
          const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card));

          if (options.updateLatestMessage && activityIdToUpdate) {
            activity.id = activityIdToUpdate;

            try {
              await context.updateActivity(activity as Partial<Activity>);
              return;
            } catch (error) {
              logger.warn("Failed to update latest Teams status message; sending a new one", {
                error
              });
            }
          }

          const sent = await context.sendActivity(activity);
          sentOrUpdatedActivityId = sent.id;
        }
      );
    } catch (error) {
      logger.error("Failed to send Teams parking status", { error });
      return {
        ok: false,
        message: "Teams 채널로 주차 현황을 보낼 수 없습니다."
      };
    }

    if (sentOrUpdatedActivityId) {
      await this.teamsStateStore.saveLatestStatusActivityId(sentOrUpdatedActivityId);
    }

    return {
      ok: true,
      message: "Teams 주차 현황 메시지를 처리했습니다."
    };
  }
}
