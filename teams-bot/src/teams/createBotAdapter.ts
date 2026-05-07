import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration
} from "botbuilder";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

export function createBotAdapter(config: AppConfig): CloudAdapter {
  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: config.microsoft.appId,
    MicrosoftAppPassword: config.microsoft.appPassword,
    MicrosoftAppType: config.microsoft.appType,
    MicrosoftAppTenantId: config.microsoft.appTenantId
  });
  const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(
    null,
    credentialsFactory
  );
  const adapter = new CloudAdapter(botFrameworkAuthentication);

  adapter.onTurnError = async (context, error) => {
    logger.error("Unhandled bot turn error", {
      message: error.message,
      stack: error.stack
    });

    await context.sendActivity("주차 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  };

  return adapter;
}
