import {
  CardFactory,
  MessageFactory,
  TeamsActivityHandler,
  TurnContext,
  type Activity,
  type InvokeResponse
} from "botbuilder";
import { isSlotNo, type ParkingActionResult, type ParkingUser } from "../domain/parking";
import type { ParkingService } from "../services/parkingService";
import { buildParkingStatusCard, type ParkingCardAction } from "./adaptiveCards";
import type { TeamsStateStore } from "./teamsStateStore";

export interface ParkingBotOptions {
  adminUserIds: string[];
  defaultPriorityLabels: string[];
  timeZone: string;
}

type ActionPayload = {
  action?: ParkingCardAction;
  slotNo?: number;
};

export class ParkingBot extends TeamsActivityHandler {
  private readonly adminUserIds: Set<string>;

  constructor(
    private readonly parkingService: ParkingService,
    private readonly teamsStateStore: TeamsStateStore,
    private readonly options: ParkingBotOptions
  ) {
    super();
    this.adminUserIds = new Set(options.adminUserIds);

    this.onMessage(async (context, next) => {
      await this.teamsStateStore.saveConversationReference(
        TurnContext.getConversationReference(context.activity)
      );

      const user = getParkingUser(context);
      const payload = parseActionPayload(context.activity.value);

      if (payload?.action) {
        await this.handleCardAction(context, user, payload);
      } else {
        await this.handleTextMessage(context, user);
      }

      await next();
    });
  }

  protected override async onInvokeActivity(context: TurnContext): Promise<InvokeResponse> {
    const payload = parseActionPayload(context.activity.value);

    if (!payload?.action) {
      return super.onInvokeActivity(context);
    }

    await this.teamsStateStore.saveConversationReference(
      TurnContext.getConversationReference(context.activity)
    );
    await this.handleCardAction(context, getParkingUser(context), payload);

    return { status: 200 };
  }

  private async handleTextMessage(context: TurnContext, user: ParkingUser): Promise<void> {
    const text = (context.activity.text ?? "").trim().toLowerCase();
    const wantsAdminPanel = ["admin", "관리자"].some((keyword) => text.includes(keyword));
    const isAdmin = this.isAdmin(user);

    if (wantsAdminPanel && !isAdmin) {
      await this.sendStatusCard(context, {
        notice: "관리자 기능은 등록된 관리자만 사용할 수 있습니다.",
        showAdminControls: false
      });
      return;
    }

    await this.sendStatusCard(context, {
      notice: wantsAdminPanel ? "관리자용 자리 제어입니다." : undefined,
      showAdminControls: wantsAdminPanel && isAdmin
    });
  }

  private async handleCardAction(
    context: TurnContext,
    user: ParkingUser,
    payload: ActionPayload
  ): Promise<void> {
    const isAdmin = this.isAdmin(user);
    let result: ParkingActionResult;
    let showAdminControls = false;

    switch (payload.action) {
      case "check_in":
        result = await this.parkingService.checkIn(user);
        break;
      case "check_out":
        result = await this.parkingService.checkOut(user);
        break;
      case "refresh":
        result = {
          ok: true,
          message: "최신 주차 현황입니다.",
          status: await this.parkingService.getStatus()
        };
        break;
      case "admin_occupy":
      case "admin_release":
        showAdminControls = isAdmin;
        result = await this.handleAdminAction(user, payload);
        break;
      default:
        result = {
          ok: false,
          message: "알 수 없는 요청입니다.",
          status: await this.parkingService.getStatus()
        };
        break;
    }

    await this.sendStatusCard(context, {
      notice: result.message,
      showAdminControls,
      updateActivityId: context.activity.replyToId
    });
  }

  private async handleAdminAction(user: ParkingUser, payload: ActionPayload): Promise<ParkingActionResult> {
    if (!this.isAdmin(user)) {
      return {
        ok: false,
        message: "관리자 기능은 등록된 관리자만 사용할 수 있습니다.",
        status: await this.parkingService.getStatus()
      };
    }

    if (!payload.slotNo || !isSlotNo(payload.slotNo)) {
      return {
        ok: false,
        message: "자리 번호를 확인할 수 없습니다.",
        status: await this.parkingService.getStatus()
      };
    }

    if (payload.action === "admin_occupy") {
      return this.parkingService.manualOccupySlot(payload.slotNo, user);
    }

    return this.parkingService.releaseSlot(payload.slotNo, user);
  }

  private async sendStatusCard(
    context: TurnContext,
    options: {
      notice?: string;
      showAdminControls: boolean;
      updateActivityId?: string;
    }
  ): Promise<void> {
    const status = await this.parkingService.getStatus();
    const card = buildParkingStatusCard(status, {
      notice: options.notice,
      showAdminControls: options.showAdminControls,
      defaultPriorityLabels: this.options.defaultPriorityLabels,
      timeZone: this.options.timeZone
    });
    const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card));

    if (options.updateActivityId) {
      activity.id = options.updateActivityId;

      try {
        await context.updateActivity(activity as Partial<Activity>);
        await this.teamsStateStore.saveLatestStatusActivityId(options.updateActivityId);
        return;
      } catch {
        // If Teams cannot update the original message, send a fresh status card.
      }
    }

    const sent = await context.sendActivity(activity);

    if (sent?.id) {
      await this.teamsStateStore.saveLatestStatusActivityId(sent.id);
    }
  }

  private isAdmin(user: ParkingUser): boolean {
    return this.adminUserIds.has(user.userId);
  }
}

function parseActionPayload(value: unknown): ActionPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as ActionPayload;
  return payload.action ? payload : null;
}

function getParkingUser(context: TurnContext): ParkingUser {
  const from = context.activity.from as typeof context.activity.from & {
    aadObjectId?: string;
    userPrincipalName?: string;
  };

  return {
    userId: from.aadObjectId ?? from.id,
    userName: from.name ?? from.userPrincipalName ?? "Unknown user"
  };
}
