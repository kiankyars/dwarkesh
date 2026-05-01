import { Tools } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';

export type DwarkeshSource = {
  label: string;
  title: string;
  link: string;
  snippet?: string;
  attribution?: string;
};

export function extractDwarkeshSources(attachments?: TAttachment[]): DwarkeshSource[] {
  if (!attachments?.length) {
    return [];
  }

  const seenLabels = new Set<string>();
  const sources: DwarkeshSource[] = [];

  for (const attachment of attachments) {
    if (attachment.type !== Tools.web_search || attachment.toolCallId !== 'dwarkesh_rag') {
      continue;
    }

    const organic = attachment[Tools.web_search]?.organic ?? [];
    for (const source of organic) {
      const label = typeof source?.label === 'string' ? source.label : '';
      if (!source?.link || !label || seenLabels.has(label)) {
        continue;
      }

      seenLabels.add(label);
      sources.push({
        label,
        title: source.title || source.link,
        link: source.link,
        snippet: source.snippet,
        attribution: source.attribution,
      });
    }
  }

  return sources;
}

export function linkDwarkeshCitations(content = '', sources: DwarkeshSource[]) {
  if (!content || sources.length === 0) {
    return content;
  }

  const sourceMap = new Map(sources.map((source) => [source.label, source]));
  const usedLabels: string[] = [];
  const seen = new Set<string>();

  const cleanedContent = content.replace(/\[(S\d+)\](?!\()/g, (_match, label) => {
    const source = sourceMap.get(label);
    if (!source) {
      return '';
    }

    if (!seen.has(label)) {
      usedLabels.push(label);
      seen.add(label);
    }

    return '';
  });

  const usedSources = usedLabels
    .map((label) => {
      const source = sourceMap.get(label);
      if (!source) {
        return null;
      }

      const safeTitle = source.title.replace(/\[|\]/g, '');
      return `[${label}: ${safeTitle}](${source.link})`;
    })
    .filter((source): source is string => Boolean(source));

  if (usedSources.length === 0) {
    return cleanedContent;
  }

  return `${cleanedContent}\n\n**Transcript sources used:** ${usedSources.join(' • ')}`;
}
