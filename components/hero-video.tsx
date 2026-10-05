"use client";

import { useRef, useState } from "react";
import { Icon } from "./ui";

const speakerOn = "M11 5 6 9H2v6h4l5 4zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14";
const speakerOff = "M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6";

/** The showreel over the engraved landscape: loops muted (autoplay rules), a click toggles sound. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.play();
    setMuted(v.muted);
  };
  return (
    <div className="relative mt-16 flex aspect-[16/10] w-full items-center justify-center overflow-hidden border border-border bg-[url(/landing/hero-bg.webp)] bg-cover bg-center sm:aspect-[2/1]">
      <button
        type="button"
        onClick={toggle}
        aria-label={muted ? "Play with sound" : "Mute"}
        className="relative w-[92%] border border-white/40 bg-black shadow-[0_24px_60px_rgb(0_0_0/0.35)] sm:w-[76%]"
      >
        <video ref={ref} src="/landing/motion.mp4" autoPlay loop muted playsInline preload="metadata" className="block aspect-video w-full" />
        <span className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 px-2.5 py-1.5 text-xs text-white backdrop-blur">
          <Icon d={muted ? speakerOff : speakerOn} size={14} />
          {muted ? "Tap for sound" : "Sound on"}
        </span>
      </button>
    </div>
  );
}
