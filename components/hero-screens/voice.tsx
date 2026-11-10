import s from "./screens.module.css";
import { Orb, StepFrame, cx } from "./shared";

/* Voice interview: the live call with the interviewer's question (Doop frame Fh_ZRlzNIS) */
export function VoiceScreen() {
  return (
    <div className={s.screen}>
      <StepFrame title="Voice interview" steps={["Sign in", "Your details", "Mic check", "Overview", "Interview"]}>
        <div className={cx(s.card, s.voiceCard)}>
          <div className={s.cardTop}>
            <span className={s.live}>Live</span>
            <span data-anim="timer">3:42 left</span>
          </div>
          <div className="relative flex size-32 items-center justify-center">
            <span data-anim="halo" className={s.halo} />
            <Orb state="listening" className="flex items-center justify-center" scale="scale-150" />
          </div>
          <div className={s.voiceText}>
            <p data-anim="ai-status" className={s.medium}>
              Listening
            </p>
            <p data-anim="caption" className={s.question}>
              Thanks, that&apos;s helpful. Tell me about a time you had to ship something with a hard deadline. What did
              you cut, and why?
            </p>
            <p data-anim="caption" className={s.mute}>
              You: Last quarter we had a launch tied to a partner event…
            </p>
          </div>
          <span className={s.endLg}>End interview</span>
        </div>
      </StepFrame>
    </div>
  );
}
