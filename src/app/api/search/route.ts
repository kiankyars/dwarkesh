import { NextRequest } from "next/server";

import { retrieveChunks } from "@/lib/rag/retrieval";
import { toJsonErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (!query) {
      return Response.json({ error: "Missing q parameter" }, { status: 400 });
    }

    const hits = await retrieveChunks(query);
    return Response.json({ hits });
  } catch (error) {
    return toJsonErrorResponse(error);
  }
}
