import s from "./screens.module.css";
import { AiTile, CamTile, CamVideo, RoomHeader, type ScreenProps } from "./shared";

/* AI interview, intro round (Doop frame oYd6k9bhCu). The captions start empty: the intro story types them in */
export function IntroScreen({ active }: ScreenProps) {
  return (
    <div className={s.screen}>
      <RoomHeader round={0} timer="1:42" total="24:42" />
      <div className={s.stage}>
        <div className={s.introTiles}>
          <AiTile big label="Interviewer · Speaking" dot="#059669" />
          <div className={s.roundName}>
            <h2 className={s.serif}>Intro</h2>
            <p className={s.mute} style={{ fontSize: 13, marginTop: 8 }}>
              Round 1 of 5
            </p>
          </div>
          <CamTile big>
            <CamVideo name="intro" position="70% 50%" active={active} />
          </CamTile>
        </div>
        <div className={s.introCaps}>
          <div data-anim="caption" className={s.cap}>
            <span className={s.capLabel}>Interviewer</span>
            <p />
          </div>
          <div className="w-48" />
          <div data-anim="caption" className={s.cap}>
            <span className={s.capLabel}>You</span>
            <p className={s.mute} />
          </div>
        </div>
      </div>
    </div>
  );
}
