export interface LinkSegment {
  text: string;
  href?: string;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** 将文本按 URL 切分为普通文本与链接片段，便于渲染可点击链接 */
export function linkify(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ text: text.slice(last, index) });
    }
    segments.push({ text: match[0], href: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last) });
  }
  return segments;
}
