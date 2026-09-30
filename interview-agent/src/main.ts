import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { EnhancerModel, audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { type Meta, createInterviewer } from './agent.ts';

// LIVEKIT_URL/API_KEY/API_SECRET, plus APP_URL and INTERVIEW_AGENT_SECRET for reporting back to the app
dotenv.config({ path: '.env.local' });

type Line = { role: 'agent' | 'candidate'; text: string };

/** Hands the transcript to the app, which stores it and runs the AI evaluation. Retries: it's the only copy. */
async function report(sessionId: string, transcript: Line[]) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${process.env.APP_URL}/api/interview/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.INTERVIEW_AGENT_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, transcript }),
    }).catch((e) => (console.error('report failed', e), null));
    if (res && res.status < 500) return; // 204 stored, 409 already stored
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  console.error('report: giving up', sessionId, JSON.stringify(transcript));
}

export default defineAgent({
  entry: async (ctx) => {
    const meta = JSON.parse(ctx.job.metadata || '{}') as Meta;
    if (!meta.sessionId) throw new Error('missing interview metadata');

    // Cheapest natural-sounding stack on LiveKit Inference: AssemblyAI streaming STT, Gemma 4 (in agent.ts),
    // Inworld TTS mini, with the audio turn detector deciding when the candidate has finished speaking.
    const session = new voice.AgentSession({
      stt: new inference.STT({ model: 'assemblyai/universal-streaming', language: 'en' }),
      tts: new inference.TTS({ model: 'inworld/inworld-tts-1.5-mini', voice: 'Ashley' }),
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        // Keeps talking through "mhm" / "right" instead of stopping at every backchannel
        interruption: { mode: 'adaptive' },
        preemptiveGeneration: { enabled: true },
      },
    });

    const transcript: Line[] = [];
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant') || !item.textContent) return;
      transcript.push({ role: item.role === 'user' ? 'candidate' : 'agent', text: item.textContent });
    });
    // Ends on end_interview, the time limit, or the candidate leaving. Closing deletes the room, which hangs up their page.
    // Report on close rather than only at job shutdown, which runs after a teardown that can stall for a minute.
    let reported: Promise<void> | undefined;
    const reportOnce = () => (reported ??= report(meta.sessionId, transcript));
    session.on(voice.AgentSessionEventTypes.Close, () => void reportOnce().finally(() => ctx.shutdown('interview over')));
    ctx.addShutdownCallback(reportOnce);

    const hangUp = async () => session.shutdown({ reason: 'interview over' });
    await session.start({
      agent: createInterviewer(meta, hangUp),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: audioEnhancement({ model: EnhancerModel.QuailVfS }),
        deleteRoomOnClose: true,
      },
    });
    await ctx.connect();
    // The candidate created the room, but greet only once they're really in (a reply queued earlier can stall)
    await ctx.waitForParticipant();

    const first = meta.candidate.name.split(' ')[0];
    session.generateReply({
      instructions: `Greet ${first} by name, introduce yourself as Alex from ${meta.job.company} in one sentence, say this is a quick ${Math.round(meta.seconds / 60)} minute chat about the ${meta.job.title} role, then ask the first question.`,
    });

    // Hard limit: a nudge 30 s before, then cut the call regardless of what's happening
    const ms = Math.max(10, meta.seconds) * 1000;
    const nudge = setTimeout(() => {
      session.generateReply({ instructions: 'Time is almost up. Do not ask new questions. Briefly thank the candidate, then call end_interview.' });
    }, ms - 30_000);
    const cut = setTimeout(() => session.shutdown({ drain: false, reason: 'time limit' }), ms);
    ctx.addShutdownCallback(async () => (clearTimeout(nudge), clearTimeout(cut)));
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    // The app dispatches by name (LIVEKIT_AGENT_NAME); local dev uses its own name so it never takes production calls
    agentName: process.env.AGENT_NAME || 'interview-agent',
  }),
);
