import { ChatShell } from "@/components/chat-shell";

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="grid gap-6 border-b border-white/40 pb-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              Dwarkesh Podcast RAG
            </p>
            <div className="space-y-3">
              <h1 className="max-w-3xl font-heading text-4xl leading-[1.05] text-balance text-ink sm:text-5xl lg:text-6xl">
                Ask across the full transcript archive, not a single episode.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Retrieval is grounded on a checked-in artifact of transcript chunks and embeddings.
                Answer generation is model-selectable and source-backed.
              </p>
            </div>
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-3xl border border-white/50 bg-white/70 p-5 shadow-[0_20px_50px_rgba(84,65,42,0.08)] backdrop-blur">
              <p className="text-sm font-medium text-ink">What this ships with</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <li>Gemini embeddings via `gemini-embedding-2-preview`</li>
                <li>All free OpenRouter text models in the picker</li>
                <li>Incremental transcript discovery from the sitemap</li>
                <li>Versioned artifact exports after successful ingests</li>
              </ul>
            </div>
          </div>
        </header>

        <div className="mt-6 flex-1">
          <ChatShell />
        </div>
      </section>
    </main>
  );
}
