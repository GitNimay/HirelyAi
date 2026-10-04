import { Agent, dedent, inference, type llm, tool, voice } from '@livekit/agents';

/** Job metadata, set by the app when it issues the candidate's token (lib/interview.ts startInterview). */
export type Meta = {
  sessionId: string;
  seconds: number;
  job: { title: string; company: string; description: string };
  candidate: { name: string; city: string; role: string; years: number };
  questions: string[];
};

// Universal-3 Pro labels a quiet stretch (the candidate listening to a question) as "Silence." and the like.
// Drop those labels when they stand alone or are bracketed, never a word inside a real sentence ("less noise").
const LABELS =
  /[[(](?:silence|noise|background noise|music|inaudible|laughs?)[\])]|(?:^|(?<=[.!?]\s))(?:silence|noise|background noise|music|inaudible)(?:[.!](?=\s|$)|$)/gi;
export const stripLabels = (t: string) => t.replace(LABELS, '').replace(/\s+/g, ' ').trim();

class Interviewer extends Agent {
  override async onUserTurnCompleted(_: llm.ChatContext, msg: llm.ChatMessage) {
    msg.content = msg.content.map((c) => (typeof c === 'string' ? stripLabels(c) : c)).filter((c) => c !== '');
    if (!msg.textContent) throw new voice.StopResponse(); // nothing was said: no reply, nothing in the transcript
  }
}

/** The interviewer: asks the recruiter's questions in order, reacts to answers, and hangs up when done. */
export function createInterviewer(meta: Meta, endCall: () => Promise<void>) {
  const { job, candidate: c, questions } = meta;
  const first = c.name.split(' ')[0] || 'there';
  return new Interviewer({
    instructions: dedent`
      You are a warm, professional interviewer at ${job.company}. Never give yourself a name; if asked, you are calling from ${job.company}. You are on a live voice call with ${first},
      running a short screening interview for the ${job.title} role.

      About the candidate: ${c.role || 'not given'}, ${c.years} years of experience, based in ${c.city || 'unknown'}.

      Ask these questions in this order, one at a time:
      ${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

      How to run the call:
      - Sound like a real person on a phone call: short natural acknowledgements that reflect what they actually said,
        varied wording, never robotic. Keep every turn to one to three short sentences.
      - Ask exactly one question per turn. You may reword a question to flow naturally, but keep its meaning.
      - If an answer is very short or vague, ask at most one brief follow-up, then move on to the next question.
      - If the candidate asks you to repeat or clarify, do that briefly and don't move on.
      - If they drift off topic, gently steer back. If they say they don't know, reassure them and move on.
      - Never score, judge or give feedback on answers, and never say whether they will get the job.
        If asked about next steps, say the hiring team will review the interview and be in touch.
      - The whole call is limited to ${Math.round(meta.seconds / 60)} minutes, so keep things moving.
      - After the last question is answered, thank them warmly in one or two sentences, then call end_interview.
        Also call end_interview if the candidate asks to stop.
      - Output plain spoken text only: no lists, markdown, emojis or special symbols.

      Job description, for context only (don't read it out):
      ${job.description}
    `,
    llm: new inference.LLM({ model: 'google/gemma-4-31b-it', modelOptions: { temperature: 0.6, max_completion_tokens: 200 } }),
    tools: {
      end_interview: tool({
        description: 'End the call. Only after you have said goodbye, or when the candidate asks to stop.',
        execute: async (_, { ctx }) => {
          await ctx.waitForPlayout(); // let the goodbye finish playing
          await endCall();
          return 'The call has ended.';
        },
      }),
    },
  });
}
