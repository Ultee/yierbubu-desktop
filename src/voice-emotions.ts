import type {DialogueEmotion} from './ai-dialogue.ts';

const INSTRUCTIONS: Record<DialogueEmotion, string> = {
  coquettish: '请用撒娇的语气说，尾音上扬，带一点奶音和俏皮，语速稍慢。',
  complaint: '请用吐槽的语气说，语速稍快，带一点无奈和嫌弃，尾音下压。',
  excited: '请用兴奋的语气说，语速轻快，情绪饱满，尾音上扬。',
};

export function instructionFor(emotion: unknown): string {
  if (emotion !== 'coquettish' && emotion !== 'complaint' && emotion !== 'excited') return '';
  return INSTRUCTIONS[emotion].slice(0, 100);
}
