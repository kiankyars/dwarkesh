import {
  convertToModelMessages,
  isTextUIPart,
  type TextUIPart,
  type UIMessage,
} from "ai";

import { listModelOptions } from "@/lib/ai/model-catalog";
import {
  buildSystemPrompt,
  parseSelectedModelId,
  resolveModelOption,
  streamChatCompletion,
} from "@/lib/ai/providers";
import { buildContextBlocks } from "@/lib/rag/retrieval";
import { AppError, toTextErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  messages: UIMessage[];
  config?: {
    modelName?: string;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new AppError(400, "Chat request must include messages");
    }

    const selectedModelId = parseSelectedModelId(body.config?.modelName);
    const catalog = await listModelOptions();
    resolveModelOption(selectedModelId, catalog);

    const query = extractLatestUserText(body.messages);
    if (!query) {
      throw new AppError(400, "Unable to extract the latest user message");
    }

    const { blocks } = await buildContextBlocks(query);
    const modelMessages = await convertToModelMessages(body.messages);
    const result = streamChatCompletion({
      modelId: selectedModelId,
      messages: modelMessages,
      system: buildSystemPrompt(blocks),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return toTextErrorResponse(error);
  }
}

function extractLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) return "";

  return latestUserMessage.parts
    .filter((part): part is TextUIPart => isTextUIPart(part))
    .map((part) => part.text)
    .join("\n")
    .trim();
}
