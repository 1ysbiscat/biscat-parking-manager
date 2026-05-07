import type { ConversationReference } from "botbuilder";
import type { ParkingRepository } from "../repositories/parkingRepository";

const CHANNEL_STATE_KEY = "teams-channel-state";

export interface TeamsChannelState {
  conversationReference: Partial<ConversationReference>;
  latestStatusActivityId?: string;
  latestStatusUpdatedAt?: string;
}

export class TeamsStateStore {
  constructor(private readonly repository: ParkingRepository) {}

  async getChannelState(): Promise<TeamsChannelState | null> {
    return this.repository.getState<TeamsChannelState>(CHANNEL_STATE_KEY);
  }

  async saveConversationReference(conversationReference: Partial<ConversationReference>): Promise<void> {
    const current = await this.getChannelState();

    await this.repository.upsertState<TeamsChannelState>(CHANNEL_STATE_KEY, {
      ...(current ?? {}),
      conversationReference
    });
  }

  async saveLatestStatusActivityId(activityId: string): Promise<void> {
    const current = await this.getChannelState();

    if (!current) {
      return;
    }

    await this.repository.upsertState<TeamsChannelState>(CHANNEL_STATE_KEY, {
      ...current,
      latestStatusActivityId: activityId,
      latestStatusUpdatedAt: new Date().toISOString()
    });
  }
}
