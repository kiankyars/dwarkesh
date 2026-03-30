import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Loader2, LogIn, RadioTower } from 'lucide-react';
import { ThemeSelector } from '@librechat/client';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import DwarkeshSources from '~/components/Chat/Messages/DwarkeshSources';
import { useGetStartupConfig } from '~/data-provider';
import { linkDwarkeshCitations } from '~/utils/dwarkeshSources';
import type { DwarkeshSource } from '~/utils/dwarkeshSources';

type PublicModel = {
  id: string;
  label: string;
  family: string;
  provider: string;
  description?: string;
};

type PublicChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: DwarkeshSource[];
  modelId?: string;
};

type PublicModelsResponse = {
  models?: PublicModel[];
  error?: string;
  details?: string;
};

type PublicChatResponse = {
  text?: string;
  sources?: DwarkeshSource[];
  modelId?: string;
  error?: string;
  details?: string;
};

const DEFAULT_PUBLIC_MODEL = 'gemini:gemini-3.1-flash-lite-preview';

export default function PublicDwarkeshRoute() {
  const { data: startupConfig } = useGetStartupConfig();
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadModels();
  }, []);

  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      const defaultModel =
        models.find((model) => model.id === DEFAULT_PUBLIC_MODEL)?.id ?? models[0]?.id ?? '';
      setSelectedModel(defaultModel);
    }
  }, [models, selectedModel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSubmitting]);

  const groupedModels = useMemo(() => {
    const groups = new Map<string, PublicModel[]>();
    for (const model of models) {
      const existing = groups.get(model.family) ?? [];
      existing.push(model);
      groups.set(model.family, existing);
    }

    return [...groups.entries()];
  }, [models]);

  const welcomeText =
    typeof startupConfig?.interface?.customWelcome === 'string'
      ? startupConfig.interface.customWelcome
      : 'Ask grounded questions across the Dwarkesh podcast transcript archive.';

  async function loadModels() {
    setIsLoadingModels(true);
    setError('');

    try {
      const response = await fetch('/api/dwarkesh/public-models');
      const payload = (await response.json()) as PublicModelsResponse;

      if (!response.ok) {
        throw new Error(formatRemoteError(response.status, payload.error, payload.details));
      }

      setModels(payload.models ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || !selectedModel || isSubmitting) {
      return;
    }

    const nextMessages = [
      ...messages,
      {
        id: createId(),
        role: 'user' as const,
        content: trimmed,
      },
    ];

    setMessages(nextMessages);
    setInput('');
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/dwarkesh/public-chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          config: {
            modelName: selectedModel,
          },
        }),
      });

      const payload = (await response.json()) as PublicChatResponse;

      if (!response.ok) {
        throw new Error(formatRemoteError(response.status, payload.error, payload.details));
      }

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: payload.text ?? '',
          sources: payload.sources ?? [],
          modelId: payload.modelId,
        },
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-presentation text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-text-secondary">
              Dwarkesh
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Transcript-grounded chat
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-border-medium px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-secondary"
            >
              <LogIn className="size-4" />
              Login
            </a>
            <ThemeSelector />
          </div>
        </header>

        <main className="grid flex-1 gap-6 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="flex flex-col justify-between rounded-[28px] border border-border-medium bg-surface-primary/70 p-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-surface-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                <RadioTower className="size-3.5" />
                Public chat
              </div>
              <p className="text-sm leading-6 text-text-secondary">{welcomeText}</p>
              <div className="space-y-3 text-sm text-text-secondary">
                <p>Answers are grounded against Dwarkesh transcript evidence only.</p>
                <p>Model failures are shown directly. Switch models if one is exhausted.</p>
                <p>Use the full workspace after login if you want saved history or personal keys.</p>
              </div>
            </div>

            <a
              href="/register"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-text-primary underline-offset-4 hover:underline"
            >
              Create an account
              <ArrowUpRight className="size-4" />
            </a>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-border-medium bg-surface-primary shadow-sm">
            <div className="border-b border-border-light px-5 py-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                className="w-full rounded-2xl border border-border-medium bg-presentation px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-border-xheavy"
                disabled={isLoadingModels || models.length === 0}
              >
                {isLoadingModels ? <option>Loading models...</option> : null}
                {!isLoadingModels && models.length === 0 ? <option>No models available</option> : null}
                {groupedModels.map(([family, familyModels]) => (
                  <optgroup key={family} label={family}>
                    {familyModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 rounded-[28px] border border-dashed border-border-medium bg-surface-secondary/40 p-6">
                  <p className="text-base font-medium text-text-primary">
                    Ask about Dwarkesh’s strongest arguments, guests, disagreements, or timeline views.
                  </p>
                  <p className="text-sm leading-6 text-text-secondary">
                    Every answer should cite transcript evidence inline, and the source cards below each answer link out to the original transcript page.
                  </p>
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-5">
                  {messages.map((message) => {
                    const linkedContent =
                      message.role === 'assistant'
                        ? linkDwarkeshCitations(message.content, message.sources ?? [])
                        : message.content;

                    return (
                      <div
                        key={message.id}
                        className={
                          message.role === 'user'
                            ? 'ml-auto max-w-[85%] rounded-[24px] bg-surface-secondary px-5 py-4'
                            : 'max-w-full rounded-[24px] border border-border-light bg-presentation px-5 py-4'
                        }
                      >
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                          {message.role === 'user' ? 'You' : message.modelId ?? 'Dwarkesh chat'}
                        </div>
                        {message.role === 'assistant' ? (
                          <MarkdownLite content={linkedContent} />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
                            {message.content}
                          </p>
                        )}
                        {message.role === 'assistant' ? (
                          <DwarkeshSources sources={message.sources ?? []} />
                        ) : null}
                      </div>
                    );
                  })}
                  {isSubmitting ? (
                    <div className="inline-flex items-center gap-2 text-sm text-text-secondary">
                      <Loader2 className="size-4 animate-spin" />
                      Thinking
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-border-light px-5 py-4">
              {error ? (
                <div className="mb-3 rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-200">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask a question about the Dwarkesh transcript archive"
                  className="min-h-[120px] w-full resize-y rounded-[24px] border border-border-medium bg-presentation px-4 py-4 text-sm leading-6 text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-border-xheavy"
                  disabled={isSubmitting || isLoadingModels || models.length === 0}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-text-secondary">
                    Public mode is transient. Login if you want saved history or personal API keys.
                  </p>
                  <button
                    type="submit"
                    className="rounded-full bg-text-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                    disabled={
                      isSubmitting || isLoadingModels || models.length === 0 || !input.trim()
                    }
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatRemoteError(status: number, error?: string, details?: string) {
  if (details) {
    return `${status} ${error ?? 'Request failed'}\n${details}`;
  }

  return `${status} ${error ?? 'Request failed'}`;
}
