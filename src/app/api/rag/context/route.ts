import { AppError, toJsonErrorResponse } from "@/lib/errors";
import { getRequiredEnv } from "@/lib/env";
import { buildGroundingContext } from "@/lib/rag/context";
import type { RagContextMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RagContextRequestBody = {
  messages?: RagContextMessage[];
  topK?: number;
};

export async function POST(request: Request) {
  try {
    assertSharedSecret(request);

    const body = (await request.json()) as RagContextRequestBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new AppError(400, "RAG context request must include messages");
    }

    const context = await buildGroundingContext({
      messages: body.messages,
      topK: body.topK,
    });

    return Response.json(context);
  } catch (error) {
    return toJsonErrorResponse(error);
  }
}

function assertSharedSecret(request: Request) {
  const secret = request.headers.get("x-librechat-shared-secret");
  if (!secret || secret !== getRequiredEnv("LIBRECHAT_SHARED_SECRET")) {
    throw new AppError(401, "Invalid LibreChat shared secret");
  }
}
