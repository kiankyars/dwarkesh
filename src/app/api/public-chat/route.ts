import { type ModelMessage } from "ai";

import { listModelOptions } from "@/lib/ai/model-catalog";
import {
  generateChatCompletion,
  parseSelectedModelId,
  resolveModelOption,
} from "@/lib/ai/providers";
import { AppError, toJsonErrorResponse } from "@/lib/errors";
import { buildGroundingContext } from "@/lib/rag/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PublicChatRequestBody = {
  messages?: PublicChatMessage[];
  config?: {
    modelName?: string;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublicChatRequestBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new AppError(400, "Chat request must include messages");
    }

    const selectedModelId = parseSelectedModelId(body.config?.modelName);
    const catalog = await listModelOptions();
    resolveModelOption(selectedModelId, catalog);

    const context = await buildGroundingContext({
      messages: body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const text = await generateChatCompletion({
      modelId: selectedModelId,
      messages: toModelMessages(body.messages),
      system: context.injectedSystemText,
    });

    return Response.json({
      text,
      modelId: selectedModelId,
      sources: context.sources.map((source) => ({
        label: source.label,
        title: `${source.label} ${source.episodeTitle}`,
        link: source.sourceUrl,
        snippet: source.sectionHeading
          ? `${source.sectionHeading}: ${source.snippet}`
          : source.snippet,
        attribution: source.episodeTitle,
      })),
    });
  } catch (error) {
    return toJsonErrorResponse(error);
  }
}

function toModelMessages(messages: PublicChatMessage[]): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
