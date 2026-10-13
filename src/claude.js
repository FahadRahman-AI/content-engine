import Anthropic from '@anthropic-ai/sdk';
import { need } from './util.js';

let client;
export const anthropic = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY

export const model = () => need('CLAUDE_MODEL');

// Basic web tool versions work on every model that supports server tools.
// Override with WEB_SEARCH_TOOL / WEB_FETCH_TOOL if you want dynamic filtering.
export const webSearchTool = (extra = {}) => ({
  type: process.env.WEB_SEARCH_TOOL || 'web_search_20250305',
  name: 'web_search',
  max_uses: 10,
  ...extra,
});
export const webFetchTool = (extra = {}) => ({
  type: process.env.WEB_FETCH_TOOL || 'web_fetch_20250910',
  name: 'web_fetch',
  max_uses: 3,
  ...extra,
});

// One logical call. Resumes pause_turn (server-tool loops) and returns the final text
// plus every URL web search returned, so callers can check a cited source_url is real.
export async function ask({ system, user, tools, maxTokens = 16000 }) {
  const messages = [{ role: 'user', content: user }];
  const searchUrls = new Set();
  for (let turn = 0; turn < 6; turn++) {
    const stream = anthropic().messages.stream({
      model: model(),
      max_tokens: maxTokens,
      system,
      messages,
      ...(tools?.length ? { tools } : {}),
    });
    const res = await stream.finalMessage();
    for (const b of res.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        b.content.forEach((r) => r.url && searchUrls.add(r.url));
      }
    }
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    if (res.stop_reason === 'refusal') throw new Error(`Model refused: ${JSON.stringify(res.stop_details)}`);
    if (res.stop_reason === 'max_tokens') throw new Error('Model output hit max_tokens');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { text, searchUrls: [...searchUrls], usage: res.usage };
  }
  throw new Error('Model kept pausing; gave up after 6 turns');
}
