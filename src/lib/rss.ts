import { politeFetch } from "./http";
import { decodeEntities } from "./text";

export interface FeedItem {
  title: string;
  link: string;
  date: string | null;
  publisher: string | null;
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, "").trim();
}

// Minimal RSS 2.0 / Atom reader: titles, links and dates only.
export function parseFeed(xml: string): FeedItem[] {
  const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return items.map((b) => {
    const atomLink = b.match(/<link[^>]+href="([^"]+)"/i)?.[1];
    const date = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated");
    const parsed = date ? Date.parse(date) : NaN;
    return {
      title: tag(b, "title") ?? "",
      link: tag(b, "link") || atomLink || "",
      date: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
      publisher: tag(b, "source"),
    };
  }).filter((i) => i.title && i.link);
}

export async function readFeed(url: string): Promise<FeedItem[]> {
  const res = await politeFetch(url, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return parseFeed(await res.text());
}

export function googleNewsUrl(query: string, days: number): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&hl=en-US&gl=US&ceid=US:en`;
}
