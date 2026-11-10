import s from "./screens.module.css";
import { StepFrame, cx } from "./shared";

/* MCQ test: question 4 of 15 with C selected (Doop frame WdEWdTo7dW) */

const OPTIONS = ["400 Bad Request", "401 Unauthorized", "403 Forbidden", "404 Not Found"];
const PICKED = 2;
const CURRENT = 4;

export function McqScreen() {
  return (
    <div className={s.screen}>
      <StepFrame title="MCQ test" steps={["Sign in", "Your details", "Instructions", "Test"]}>
        <div className={s.card}>
          <div className={s.status}>
            <div className={s.between}>
              <span>
                Question{" "}
                <span className={s.medium} style={{ color: "var(--foreground)" }}>
                  {CURRENT}
                </span>{" "}
                of 15
              </span>
              <span data-anim="timer" className={s.timer}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2" />
                </svg>
                <span>11:37</span>
              </span>
            </div>
            <div className={s.bar}>
              <div data-anim="progress" className={s.barFill} />
            </div>
          </div>
          <div className={s.mcqBody}>
            <p>
              Which HTTP status code should an API return when a request is well-formed but the user isn&apos;t allowed
              to access the resource?
            </p>
            <div className={s.options}>
              {OPTIONS.map((o, i) => (
                <div key={o} data-anim="option" className={cx(s.option, i === PICKED && s.optionOn)}>
                  <span className={s.optLetter}>{"ABCD"[i]}</span>
                  <span className={s.optText}>{o}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={s.between}>
            <span className={cx(s.mute, s.medium)} style={{ padding: "0 12px" }}>
              Previous
            </span>
            <span data-anim="next" className={s.next}>
              Next
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--background)"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </div>
          <div className={s.qnav}>
            <div className={s.between} style={{ fontSize: 12, lineHeight: "16px" }}>
              <span data-anim="answered" className={s.mute}>
                {CURRENT} of 15 answered
              </span>
              <span className={s.medium}>Submit early</span>
            </div>
            <div className={s.grid}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                <span
                  key={n}
                  data-anim="question-cell"
                  className={cx(n <= CURRENT && s.answered, n === CURRENT && s.current)}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </StepFrame>
    </div>
  );
}
