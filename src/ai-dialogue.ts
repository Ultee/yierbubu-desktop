export interface DialogueLine { who: 'yier' | 'bubu'; text: string }

/** Parse a two-pet exchange; anything not matching the strict line format is discarded. */
export function parseDialogue(reply: string): DialogueLine[] | null {
  if (typeof reply !== 'string') return null;
  const lines: DialogueLine[] = [];
  for (const raw of reply.split(/\r?\n/)) {
    const match = raw.trim().match(/^(一二|布布)\s*[:：]\s*(.+)$/);
    if (!match) continue;
    const text = [...match[2].trim()].slice(0, 80).join('').trim();
    if (!text) continue;
    lines.push({ who: match[1] === '布布' ? 'bubu' : 'yier', text });
    if (lines.length === 6) break;
  }
  return lines.length >= 2 ? lines : null;
}
