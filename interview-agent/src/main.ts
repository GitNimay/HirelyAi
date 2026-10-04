import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
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

    // LiveKit Inference: AssemblyAI Universal-3.6 Pro STT, Gemma 4 (in agent.ts), Inworld TTS mini, with the audio
    // turn detector deciding when the candidate has finished speaking. The old universal-streaming model was US
    // English only and garbled accented speech; U3 Pro handles Indian and other English accents, is biased by the
    // interviewer's last question (the SDK sends it as agent_context) and by the names/terms of this call below.
    const { job, candidate: c } = meta;
    const keyterms = [job.company, job.title, c.name, c.city, c.role].filter(Boolean).map((t) => t.slice(0, 50));
    const session = new voice.AgentSession({
      stt: new inference.STT({
        model: 'assemblyai/universal-3-6-pro',
        language: 'en',
        modelOptions: {
          keyterms_prompt: keyterms,
          // AssemblyAI's own noise suppression. Their guidance: don't clean audio before the model (we used to run
          // ai-coustics here), its artifacts cost more accuracy than the noise; candidates are mostly on laptop mics.
          voice_focus: 'far-field',
        },
      }),
      tts: new inference.TTS({ model: 'inworld/inworld-tts-1.5-mini', voice: 'Ashley' }),
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        // Candidates pause to think mid-answer: the detector's chat-tuned defaults (300 ms / 2.5 s) cut them into
        // fragments, and U3 Pro's final text can land after a 300 ms commit. Costs ~300 ms of reply latency.
        endpointing: { minDelay: 600, maxDelay: 4000 },
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
    let noShow = false; // pre-warmed during the mic check, but the candidate never pressed Start: nothing to report
    const reportOnce = () => (reported ??= noShow ? Promise.resolve() : report(meta.sessionId, transcript));
    session.on(voice.AgentSessionEventTypes.Close, () => void reportOnce().finally(() => ctx.shutdown('interview over')));
    ctx.addShutdownCallback(reportOnce);

    const hangUp = async () => session.shutdown({ reason: 'interview over' });
    await session.start({
      agent: createInterviewer(meta, hangUp),
      room: ctx.room,
      inputOptions: {
        deleteRoomOnClose: true,
      },
    });
    await ctx.connect();
    // The app dispatches us while the candidate checks their mic (warmInterview), so wait for them, but not forever.
    // Greet only once they're really in (a reply queued earlier can stall).
    const joined = await Promise.race([
      ctx.waitForParticipant().then(() => true),
      new Promise<false>((r) => setTimeout(r, 15 * 60_000, false)),
    ]);
    if (!joined) {
      noShow = true;
      return session.shutdown({ reason: 'candidate never joined' });
    }

    const first = meta.candidate.name.split(' ')[0];
    session.generateReply({
      instructions: `Greet ${first} by name, say you're calling from ${meta.job.company} (no name for yourself), say this is a quick ${Math.round(meta.seconds / 60)} minute chat about the ${meta.job.title} role, then ask the first question.`,
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
