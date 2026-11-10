export type DialogueEmotion = 'coquettish' | 'complaint' | 'excited';
export interface DialogueLine { who: 'yier' | 'bubu'; text: string; emotion?: DialogueEmotion }

const EMOTION_TAGS: Record<string, DialogueEmotion> = {'撒娇': 'coquettish', '吐槽': 'complaint', '兴奋': 'excited'};

/** Parse a two-pet exchange; anything not matching the strict line format is discarded. */
export function parseDialogue(reply: string): DialogueLine[] | null {
  if (typeof reply !== 'string') return null;
  const lines: DialogueLine[] = [];
  for (const raw of reply.split(/\r?\n/)) {
    const match = raw.trim().match(/^(一二|布布)\s*[:：]\s*(.+)$/);
    if (!match) continue;
    let body = match[2].trim();
    let emotion: DialogueEmotion | undefined;
    const tag = body.match(/^\[(撒娇|吐槽|兴奋)\]\s*/);
    if (tag) {
      emotion = EMOTION_TAGS[tag[1]!];
      body = body.slice(tag[0].length);
    }
    const text = [...body].slice(0, 80).join('').trim();
    if (!text) continue;
    const line: DialogueLine = {who: match[1] === '布布' ? 'bubu' : 'yier', text};
    if (emotion) line.emotion = emotion;
    lines.push(line);
    if (lines.length === 6) break;
  }
  return lines.length >= 2 ? lines : null;
}
