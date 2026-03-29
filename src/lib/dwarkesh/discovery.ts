import * as cheerio from "cheerio";

import { DWARKESH_SITE_URL } from "@/lib/config";

export async function discoverEpisodeUrls() {
  const yearPages = await discoverYearPages();
  const urls = new Set<string>();

  for (const yearPage of yearPages) {
    const html = await fetchText(yearPage);
    const $ = cheerio.load(html);

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;

      const url = toAbsoluteUrl(href);
      if (url.startsWith(`${DWARKESH_SITE_URL}/p/`)) {
        urls.add(url);
      }
    });
  }

  return [...urls];
}

async function discoverYearPages() {
  const html = await fetchText(`${DWARKESH_SITE_URL}/sitemap`);
  const $ = cheerio.load(html);
  const pages = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const url = toAbsoluteUrl(href);
    if (/\/sitemap\/\d{4}$/.test(url)) {
      pages.add(url);
    }
  });

  return [...pages].sort().reverse();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "dwarkesh-podcast-rag/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function toAbsoluteUrl(href: string) {
  return new URL(href, DWARKESH_SITE_URL).toString();
}
