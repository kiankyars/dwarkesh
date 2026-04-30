import {
  DWARKESH_ARCHIVE_API_URL,
  DWARKESH_POST_API_URL,
  DWARKESH_SITE_URL,
} from "@/lib/config";

const ARCHIVE_PAGE_SIZE = 50;
const MAX_ARCHIVE_PAGES = 20;
const FETCH_ATTEMPTS = 5;
const USER_AGENT = "dwarkesh-podcast-rag/0.2";

type ArchivePostTag = {
  slug?: string | null;
};

type ArchivePost = {
  id: number;
  slug?: string | null;
  title?: string | null;
  type?: string | null;
  post_date?: string | null;
  canonical_url?: string | null;
  postTags?: ArchivePostTag[] | null;
};

export type DiscoveredPodcastPost = {
  id: number;
  slug: string;
  title: string;
  publishedAt: string | null;
  sourceUrl: string;
};

export type SubstackPostDetail = ArchivePost & {
  subtitle?: string | null;
  body_html?: string | null;
  body_json?: unknown;
  wordcount?: number | null;
  podcast_upload_id?: string | null;
  podcast_url?: string | null;
  podcastUpload?: MediaUpload | null;
  videoUpload?: (MediaUpload & { extractedAudio?: MediaUpload | null }) | null;
};

type MediaUpload = {
  transcription?: {
    cdn_url?: string | null;
    cdn_unaligned_url?: string | null;
  } | null;
};

export async function discoverPodcastPosts() {
  const discovered = new Map<number, DiscoveredPodcastPost>();
  let offset = 0;

  for (let pageIndex = 0; pageIndex < MAX_ARCHIVE_PAGES; pageIndex += 1) {
    const page = await fetchArchivePage(offset);
    if (page.length === 0) break;

    for (const post of page) {
      if (!isPodcastPost(post)) continue;

      const normalized = normalizeArchivePost(post);
      if (normalized) {
        discovered.set(normalized.id, normalized);
      }
    }

    offset += page.length;
  }

  return [...discovered.values()].sort(compareDiscoveredPosts);
}

export async function discoverEpisodeUrls() {
  const posts = await discoverPodcastPosts();
  return posts.map((post) => post.sourceUrl);
}

export async function fetchPostDetail(slug: string) {
  const url = `${DWARKESH_POST_API_URL}/${encodeURIComponent(slug)}`;
  return fetchJson<SubstackPostDetail>(url);
}

async function fetchArchivePage(offset: number) {
  const url = new URL(DWARKESH_ARCHIVE_API_URL);
  url.searchParams.set("sort", "new");
  url.searchParams.set("search", "");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(ARCHIVE_PAGE_SIZE));

  return fetchJson<ArchivePost[]>(url.toString());
}

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 429 && attempt < FETCH_ATTEMPTS - 1) {
      await sleep(parseRetryAfter(response.headers.get("retry-after")));
      continue;
    }

    if (response.status >= 500 && attempt < FETCH_ATTEMPTS - 1) {
      await sleep(1_000 * 2 ** attempt);
      continue;
    }

    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  throw new Error(`Failed to fetch ${url}: exhausted retries`);
}

function isPodcastPost(post: ArchivePost) {
  return post.type === "podcast";
}

function normalizeArchivePost(post: ArchivePost): DiscoveredPodcastPost | null {
  const slug = post.slug?.trim();
  const title = post.title?.trim();
  if (!post.id || !slug || !title) return null;

  return {
    id: post.id,
    slug,
    title,
    publishedAt: post.post_date ?? null,
    sourceUrl: normalizeSourceUrl(post.canonical_url, slug),
  };
}

function normalizeSourceUrl(value: string | null | undefined, slug: string) {
  if (!value) return `${DWARKESH_SITE_URL}/p/${slug}`;

  try {
    return new URL(value).toString();
  } catch {
    return `${DWARKESH_SITE_URL}/p/${slug}`;
  }
}

function compareDiscoveredPosts(left: DiscoveredPodcastPost, right: DiscoveredPodcastPost) {
  return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
}

function parseRetryAfter(value: string | null) {
  if (!value) return 1_000;

  const numericSeconds = Number(value);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return numericSeconds * 1_000;
  }

  const retryDate = Date.parse(value);
  if (Number.isNaN(retryDate)) {
    return 1_000;
  }

  return Math.max(1_000, retryDate - Date.now());
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
