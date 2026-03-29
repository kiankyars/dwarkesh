"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";

import { ModelSelect } from "@/components/model-select";
import { formatDate } from "@/lib/utils";
import type { ModelOption, RetrievedChunk } from "@/lib/types";

export function ChatShell() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchHits, setSearchHits] = useState<RetrievedChunk[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");

  const applyCatalog = useEffectEvent((payload: { models: ModelOption[] }) => {
    setModels(payload.models);
    setSelectedModelId((current) => current || payload.models[0]?.id || "");
    setCatalogError(null);
  });

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const response = await fetch("/api/models", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Model catalog failed: ${response.status}`);
        }

        const payload = (await response.json()) as { models: ModelOption[] };
        if (!cancelled) {
          applyCatalog(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setCatalogError(error instanceof Error ? error.message : "Failed to load models");
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deferredSearchQuery.trim()) {
      setSearchHits([]);
      setSearchStatus("idle");
      return;
    }

    let cancelled = false;

    const runSearch = async () => {
      setSearchStatus("loading");

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(deferredSearchQuery.trim())}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const payload = (await response.json()) as { hits: RetrievedChunk[] };
        if (!cancelled) {
          startTransition(() => {
            setSearchHits(payload.hits);
            setSearchStatus("idle");
          });
        }
      } catch {
        if (!cancelled) {
          setSearchStatus("error");
        }
      }
    };

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [deferredSearchQuery]);

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async (options) => {
          const existingBody =
            options.body && typeof options.body === "object"
              ? (options.body as Record<string, unknown>)
              : {};
          const existingConfig =
            existingBody.config && typeof existingBody.config === "object"
              ? (existingBody.config as Record<string, unknown>)
              : {};

          return {
            body: {
              ...existingBody,
              config: {
                ...existingConfig,
                modelName: selectedModelId,
              },
              id: options.id,
              messages: options.messages,
              trigger: options.trigger,
              messageId: options.messageId,
              metadata: options.requestMetadata,
            },
          };
        },
      }),
    [selectedModelId],
  );

  const runtime = useChatRuntime({
    transport,
    onError: (error) => {
      setChatError(error.message);
    },
  });

  return (
    <div className="grid h-full gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-[2rem] border border-white/50 bg-panel p-5 shadow-[0_24px_60px_rgba(58,41,21,0.08)] backdrop-blur">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Retrieval
            </p>
            <h2 className="mt-2 font-heading text-2xl text-ink">Transcript search</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This panel hits the same retrieval layer the chat route uses before generation.
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Search the archive
            </span>
            <textarea
              className="min-h-28 rounded-2xl border border-line bg-white/85 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent"
              placeholder="e.g. What did Satya Nadella say about AGI and quantum?"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>Results</span>
              <span>{searchStatus === "loading" ? "Loading" : `${searchHits.length} hits`}</span>
            </div>

            <div className="space-y-3">
              {searchStatus === "error" ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Retrieval failed. Check your database and Gemini embedding key.
                </p>
              ) : null}

              {searchHits.length === 0 && searchStatus !== "error" ? (
                <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm leading-6 text-muted-foreground">
                  Results appear here once you have indexed transcripts and type a query.
                </div>
              ) : null}

              {searchHits.map((hit) => (
                <article
                  key={hit.id}
                  className="rounded-2xl border border-white/60 bg-white/85 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{hit.episodeTitle}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {formatDate(hit.publishedAt)} · {hit.score.toFixed(3)}
                      </p>
                    </div>
                  </div>
                  {hit.sectionHeading ? (
                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-accent">
                      {hit.sectionHeading}
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {trimExcerpt(hit.text)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="min-h-[72vh] rounded-[2rem] border border-white/50 bg-panel shadow-[0_24px_60px_rgba(58,41,21,0.08)] backdrop-blur">
        <AssistantRuntimeProvider runtime={runtime}>
          <div className="flex h-full flex-col">
            <div className="flex flex-col gap-4 border-b border-white/40 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                  Chat
                </p>
                <div>
                  <h2 className="font-heading text-2xl text-ink">Grounded Q&A</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Pick a model. If it fails upstream, the raw error is surfaced and you switch models.
                  </p>
                </div>
              </div>

              <div className="w-full sm:max-w-sm">
                <ModelSelect
                  models={models}
                  value={selectedModelId}
                  onChange={(nextValue) => {
                    setChatError(null);
                    setSelectedModelId(nextValue);
                  }}
                  disabled={models.length === 0}
                />
              </div>
            </div>

            {catalogError ? (
              <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-900">
                {catalogError}
              </div>
            ) : null}

            {chatError ? (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
                {chatError}
              </div>
            ) : null}

            <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
              <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col px-5 py-5">
                <ThreadPrimitive.Empty>
                  <div className="flex flex-1 items-center justify-center">
                    <div className="max-w-xl rounded-[2rem] border border-dashed border-line bg-white/60 px-6 py-8 text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                        Ready
                      </p>
                      <h3 className="mt-3 font-heading text-3xl text-ink">
                        Ask anything grounded in the transcripts
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">
                        Example: “What is Dwarkesh’s strongest argument for slower AGI timelines?”
                      </p>
                    </div>
                  </div>
                </ThreadPrimitive.Empty>

                <ThreadPrimitive.Messages
                  components={{
                    UserMessage,
                    AssistantMessage,
                  }}
                />
              </ThreadPrimitive.Viewport>

              <div className="border-t border-white/40 px-5 py-5">
                <ComposerPrimitive.Root className="rounded-[1.75rem] border border-line bg-white/85 p-3 shadow-sm">
                  <ComposerPrimitive.Input
                    rows={3}
                    submitMode="enter"
                    placeholder="Ask about a guest, argument, claim, or episode..."
                    className="min-h-28 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-7 text-ink outline-none placeholder:text-muted-foreground"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3 px-2 pb-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Shift + Enter for a newline
                    </p>
                    <ComposerPrimitive.Send className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">
                      Send
                    </ComposerPrimitive.Send>
                  </div>
                </ComposerPrimitive.Root>
              </div>
            </ThreadPrimitive.Root>
          </div>
        </AssistantRuntimeProvider>
      </section>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="message-copy max-w-[85%] rounded-[1.6rem] rounded-br-md bg-ink px-5 py-4 text-[15px] leading-7 text-white shadow-sm">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-start">
      <div className="max-w-[90%] rounded-[1.6rem] rounded-bl-md border border-white/70 bg-white/90 px-5 py-4 shadow-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          Retrieved answer
        </div>
        <div className="message-copy text-[15px] leading-7 text-ink">
          <MessagePrimitive.Content />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function trimExcerpt(value: string) {
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}
