"use client";

import { useState } from "react";
import { Composer } from "./feed";
import { Modal } from "./kit";
import { btnLg, btnOutline, btnPrimary, Icon, icons } from "./ui";
import { cn } from "@/lib/utils";

/** Sidebar "Post" button: opens the composer in a dialog from any dashboard page. Full width with a label on xl, a round + on the slim rail. `compact` is a 32px "+ Post" pill for the phone top bar. */
export function PostButton({
  viewer,
  compact,
}: {
  viewer: { id: string; name: string; imageUrl?: string };
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Like X / Threads: a label on the wide rail, icon only on the slim one; always labeled in the phone bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create a post"
        title="Post"
        className={
          compact
            ? cn(btnPrimary, "h-8 max-sm:h-8 gap-1 rounded-full px-3")
            : `${btnOutline} ${btnLg} w-full rounded-full px-0 text-sm font-medium xl:px-4`
        }
      >
        <Icon d={icons.plus} size={compact ? 16 : 20} className={compact ? undefined : "xl:hidden"} />
        <span className={compact ? undefined : "hidden xl:inline"}>Post</span>
      </button>
      {open && (
        <Modal title="Create a post" onClose={() => setOpen(false)}>
          <Composer
            viewer={viewer}
            onPosted={(p) => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("posted", { detail: p }));
            }}
          />
        </Modal>
      )}
    </>
  );
}
