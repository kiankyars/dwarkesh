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

  const sourceMap = new Map(sources.map((source) => [source.label, source.link]));
  return content.replace(/\[(S\d+)\](?!\()/g, (match, label) => {
    const link = sourceMap.get(label);
    if (!link) {
      return match;
    }

    return `[${label}](${link})`;
  });
}
