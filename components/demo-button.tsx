"use client";

import { useState } from "react";
import { Modal } from "./kit";

// Demo video, embedded via youtube-nocookie so nothing loads from Google until it's opened
const DEMO_URL = "https://www.youtube-nocookie.com/embed/5r2nMkFuAm4?autoplay=1&rel=0";

/** Secondary hero CTA: the product demo video, opened in a modal so the visitor never leaves the page. */
export function DemoButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Demo
      </button>
      {open && (
        <Modal title="Hirely AI demo" onClose={() => setOpen(false)} wide>
          {/* 16:9 on every screen; the iframe only mounts while open, so closing it stops playback */}
          <div className="aspect-video w-full">
            <iframe
              src={DEMO_URL}
              title="Hirely AI product demo"
              className="size-full rounded-b-xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </Modal>
      )}
    </>
  );
}
