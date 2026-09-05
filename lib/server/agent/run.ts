import Anthropic from '@anthropic-ai/sdk';

import { contextPrompt, SYSTEM_PROMPT } from '@/lib/server/agent/prompt';
import { AGENT_TOOLS, AgentSession } from '@/lib/server/agent/tools';
import type { ChatAction, ChatRequest, ChatResponse } from '@/lib/types';

const DEFAULT_MODEL = 'claude-opus-5';
const MAX_ITERATIONS = 8;
const MAX_HISTORY = 24;
const MAX_OUTPUT_TOKENS = 2048;

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export function getAgentConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const effort = process.env.CICERO_EFFORT?.trim() as Effort | undefined;
  return {
    apiKey,
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    effort: effort && ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'medium' as Effort,
  };
}

/** The API requires the first message to be from the user. */
function historyToMessages(history: ChatRequest['messages']): Anthropic.Beta.BetaMessageParam[] {
  const recent = history.slice(-MAX_HISTORY);
  const firstUser = recent.findIndex((message) => message.role === 'user');
  if (firstUser < 0) return [];
  return recent.slice(firstUser).map((message) => ({ role: message.role, content: message.text }));
}

function metaFor(actions: ChatAction[]) {
  if (actions.some((action) => action.type === 'add_stops')) return 'Tappe verificate su Google Places';
  if (actions.some((action) => action.type === 'show_candidates')) return 'Ricerca Google Places completata';
  if (actions.some((action) => action.type === 'remove_stops' || action.type === 'shift_times' || action.type === 'set_itinerary')) return 'Itinerario aggiornato, non rigenerato';
  if (actions.some((action) => action.type === 'update_profile')) return 'Profilo aggiornato dalla conversazione';
  return undefined;
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]) {
  return content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function runAgent(request: ChatRequest): Promise<ChatResponse> {
  const config = getAgentConfig();
  if (!config) throw new Error('ANTHROPIC_API_KEY is not configured');

  const client = new Anthropic({ apiKey: config.apiKey, timeout: 60_000, maxRetries: 1 });
  const session = new AgentSession(request.context);
  const messages = historyToMessages(request.messages);
  if (!messages.length) return { reply: 'Dimmi cosa ti piacerebbe fare e quanto tempo hai.', actions: [] };

  let reply = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const response = await client.beta.messages.create({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: config.effort },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextPrompt(request.context) },
      ],
      tools: AGENT_TOOLS,
      messages,
    });

    reply = textOf(response.content) || reply;

    if (response.stop_reason === 'refusal') {
      return { reply: reply || 'Preferisco non rispondere a questa richiesta. Posso aiutarti con l\'itinerario.', actions: session.actions };
    }

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUses = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) break;

    messages.push({ role: 'assistant', content: response.content });
    const results = await Promise.all(toolUses.map(async (toolUse): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      const outcome = await session.execute(toolUse.name, toolUse.input);
      return { type: 'tool_result', tool_use_id: toolUse.id, content: outcome.content, is_error: outcome.isError || undefined };
    }));
    messages.push({ role: 'user', content: results });
  }

  return {
    reply: reply || (session.actions.length ? 'Fatto. Il piano è aggiornato sulla mappa.' : 'Non sono riuscito a completare la richiesta. Puoi riformularla?'),
    meta: metaFor(session.actions),
    actions: session.actions,
  };
}
