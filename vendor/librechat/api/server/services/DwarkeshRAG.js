const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const { Tools } = require('librechat-data-provider');

const DWARKESH_TOOL_CALL_ID = 'dwarkesh_rag';
const DWARKESH_SEARCH_TURN = 1000;

async function fetchDwarkeshGrounding({ messages, messageId, conversationId }) {
  const baseUrl = process.env.DWARKESH_RAG_API_BASE;
  const sharedSecret = process.env.DWARKESH_RAG_SHARED_SECRET;

  if (!baseUrl || !sharedSecret) {
    throw new Error('Dwarkesh RAG is not configured');
  }

  const serializedMessages = serializeMessages(messages);
  if (serializedMessages.length === 0) {
    return null;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/rag/context`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-librechat-shared-secret': sharedSecret,
    },
    body: JSON.stringify({
      messages: serializedMessages,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    const error = new Error(`Dwarkesh RAG request failed: ${response.status}`);
    error.status = response.status;
    error.responseBody = responseBody;
    throw error;
  }

  const payload = await response.json();
  const attachment = buildSearchAttachment({
    sources: payload.sources ?? [],
    messageId,
    conversationId,
  });

  logger.debug('[DwarkeshRAG] Grounding complete', {
    messageId,
    conversationId,
    sourceCount: payload.sources?.length ?? 0,
    query: payload.query,
  });

  return {
    injectedSystemText: payload.injectedSystemText,
    attachment,
  };
}

function serializeMessages(messages) {
  return messages
    .map((message) => ({
      role: message.isCreatedByUser ? 'user' : 'assistant',
      content: extractMessageText(message),
    }))
    .filter((message) => message.content.length > 0);
}

function extractMessageText(message) {
  if (typeof message?.text === 'string') {
    return message.text.trim();
  }

  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return '';
        }

        if (typeof part.text === 'string') {
          return part.text;
        }

        if (part.text && typeof part.text === 'object' && typeof part.text.value === 'string') {
          return part.text.value;
        }

        if (typeof part.think === 'string') {
          return part.think;
        }

        if (part.think && typeof part.think === 'object' && typeof part.think.value === 'string') {
          return part.think.value;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof message?.content === 'string') {
    return message.content.trim();
  }

  return '';
}

function buildSearchAttachment({ sources, messageId, conversationId }) {
  if (!sources.length) {
    return null;
  }

  const organic = sources.map((source) => ({
    label: source.label,
    title: `${source.label} ${source.episodeTitle}`,
    link: source.sourceUrl,
    snippet: source.sectionHeading
      ? `${source.sectionHeading}: ${source.snippet}`
      : source.snippet,
    attribution: source.episodeTitle,
  }));

  return {
    type: Tools.web_search,
    toolCallId: DWARKESH_TOOL_CALL_ID,
    messageId,
    conversationId,
    name: `dwarkesh_rag_sources_${nanoid()}`,
    [Tools.web_search]: {
      turn: DWARKESH_SEARCH_TURN,
      organic,
      topStories: [],
      images: [],
      references: organic,
    },
  };
}

module.exports = {
  DWARKESH_TOOL_CALL_ID,
  fetchDwarkeshGrounding,
};
