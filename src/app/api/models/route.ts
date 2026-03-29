import { listModelOptions } from "@/lib/ai/model-catalog";
import { toJsonErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const models = await listModelOptions();
    return Response.json({ models });
  } catch (error) {
    return toJsonErrorResponse(error);
  }
}
