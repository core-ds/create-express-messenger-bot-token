import * as core from "@actions/core";
import * as http from "@actions/http-client";
import { createHmac } from "node:crypto";
import isNetworkError from "is-network-error";
import pRetry from "p-retry";

export async function main(): Promise<string> {
  const serverUrl = core.getInput("express-server-url", { required: true });
  const botId = core.getInput("bot-id", { required: true });
  const secretKey = core.getInput("secret-key", { required: true });

  const signature = createHmac("sha256", secretKey).update(botId).digest("hex").toUpperCase(); // using rfc4648: 0-9 A-Z
  const url = new URL(`/api/v2/botx/bots/${botId}/token`, serverUrl);
  url.searchParams.append("signature", signature);

  const client = new http.HttpClient("create-express-messenger-bot-token");
  const token = await pRetry(
    async () => {
      const response = await client.get(url.toString());
      const body = await response.readBody();
      const json: unknown = JSON.parse(body);

      if (json != null && typeof json === "object" && "result" in json && typeof json.result === "string") {
        return json.result;
      }

      throw new Error("Invalid response format");
    },
    {
      shouldRetry: ({ error }) =>
        (error instanceof http.HttpClientError && error.statusCode >= 500) || isNetworkError(error),
      onFailedAttempt: (context) => {
        core.info(
          `Failed to create token for ${serverUrl} (attempt ${context.attemptNumber}): ${context.error.message}`
        );
      },
      retries: 3,
    }
  );

  core.saveState("token", token);

  return token;
}
