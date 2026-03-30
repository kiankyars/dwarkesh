import { useMemo } from 'react';
import { Globe } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { extractDwarkeshSources } from '~/utils/dwarkeshSources';
import type { DwarkeshSource } from '~/utils/dwarkeshSources';

export default function DwarkeshSources({
  attachments,
  sources: providedSources,
}: {
  attachments?: TAttachment[];
  sources?: DwarkeshSource[];
}) {
  const localize = useLocalize();
  const sources = useMemo(
    () => providedSources ?? extractDwarkeshSources(attachments),
    [attachments, providedSources],
  );

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
            key={source.label}
            href={source.link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border-light bg-surface-primary px-3 py-2 transition-colors hover:bg-surface-hover"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                {source.label}
              </span>
              <p className="text-sm font-medium text-text-primary">{source.title}</p>
            </div>
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
