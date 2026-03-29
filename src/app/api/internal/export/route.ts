import { exportArtifacts } from "@/lib/artifacts/export";
import { AppError, toJsonErrorResponse } from "@/lib/errors";
import { getRequiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-crawl-secret");
    if (!secret || secret !== getRequiredEnv("CRAWL_SECRET")) {
      throw new AppError(401, "Invalid crawl secret");
    }

    const result = await exportArtifacts();
    return Response.json(result);
  } catch (error) {
    return toJsonErrorResponse(error);
  }
}
