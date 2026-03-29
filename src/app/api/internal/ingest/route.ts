import { runIngest } from "@/lib/dwarkesh/ingest";
import { AppError, toJsonErrorResponse } from "@/lib/errors";
import { getRequiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSecret(request);
    const payload = (await request.json().catch(() => ({}))) as {
      mode?: "incremental" | "backfill";
    };

    const summary = await runIngest(payload.mode === "backfill" ? "backfill" : "incremental");
    return Response.json(summary);
  } catch (error) {
    return toJsonErrorResponse(error);
  }
}

function assertSecret(request: Request) {
  const secret = request.headers.get("x-crawl-secret");
  if (!secret || secret !== getRequiredEnv("CRAWL_SECRET")) {
    throw new AppError(401, "Invalid crawl secret");
  }
}
