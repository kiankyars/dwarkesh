import { useMemo } from 'react';
import { Globe } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type DwarkeshSource = {
  title: string;
  link: string;
  snippet?: string;
  attribution?: string;
};

function extractDwarkeshSources(attachments?: TAttachment[]): DwarkeshSource[] {
  if (!attachments?.length) {
    return [];
  }

  const seenLinks = new Set<string>();
  const sources: DwarkeshSource[] = [];

  for (const attachment of attachments) {
    if (attachment.type !== Tools.web_search || attachment.toolCallId !== 'dwarkesh_rag') {
      continue;
    }

    const organic = attachment[Tools.web_search]?.organic ?? [];
    for (const source of organic) {
      if (!source?.link || seenLinks.has(source.link)) {
        continue;
      }

      seenLinks.add(source.link);
      sources.push({
        title: source.title || source.link,
        link: source.link,
        snippet: source.snippet,
        attribution: source.attribution,
      });
    }
  }

  return sources;
}

export default function DwarkeshSources({ attachments }: { attachments?: TAttachment[] }) {
  const localize = useLocalize();
  const sources = useMemo(() => extractDwarkeshSources(attachments), [attachments]);

  if (!sources.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-border-medium/80 bg-surface-secondary px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
        <Globe className="size-3.5" />
        <span>{localize('com_sources_title')}</span>
      </div>

      <div className="mt-3 grid gap-2">
        {sources.map((source) => (
          <a
            key={source.link}
            href={source.link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border-light bg-surface-primary px-3 py-2 transition-colors hover:bg-surface-hover"
          >
            <p className="text-sm font-medium text-text-primary">{source.title}</p>
            {source.attribution ? (
              <p className="mt-1 text-xs text-text-secondary">{source.attribution}</p>
            ) : null}
            {source.snippet ? (
              <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{source.snippet}</p>
            ) : null}
          </a>
        ))}
      </div>
    </div>
  );
}
