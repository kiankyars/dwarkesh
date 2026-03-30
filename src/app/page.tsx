import { loadArtifactBundle } from "@/lib/artifacts/store";

export default async function Home() {
  const artifact = await loadArtifactBundle({ allowMissing: true });
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 sm:px-8 lg:px-10">
        <div className="rounded-[2rem] border border-white/50 bg-white/70 p-8 shadow-[0_20px_50px_rgba(84,65,42,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Dwarkesh Backend
          </p>
          <div className="mt-4 space-y-4">
            <h1 className="max-w-3xl font-heading text-4xl leading-[1.05] text-balance text-ink sm:text-5xl">
              Artifact-backed retrieval service for the LibreChat frontend.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              This Render app owns sitemap ingestion, transcript parsing, embeddings, retrieval,
              and the private grounding API consumed by the public LibreChat deployment.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard label="Indexed episodes" value={String(artifact.manifest.episodeCount)} />
            <StatCard label="Indexed chunks" value={String(artifact.manifest.chunkCount)} />
            <StatCard
              label="Last artifact export"
              value={artifact.manifest.exportedAt || "Not indexed yet"}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-border/60 bg-background/70 p-6">
              <p className="text-sm font-semibold text-ink">Primary routes</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <li>`POST /api/rag/context` for private LibreChat grounding</li>
                <li>`GET /api/search?q=` for retrieval diagnostics</li>
                <li>`POST /api/internal/ingest` for cron-triggered updates</li>
                <li>`POST /api/internal/export` for artifact snapshot export</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-border/60 bg-background/70 p-6">
              <p className="text-sm font-semibold text-ink">Runtime notes</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <li>Embeddings use `gemini-embedding-2-preview`.</li>
                <li>Artifacts are served from local disk, not a live vector database.</li>
                <li>LibreChat sends the selected generation model and owns user API keys.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-background/70 p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
