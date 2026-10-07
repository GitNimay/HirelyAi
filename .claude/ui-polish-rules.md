# UI polish rules (Hire Excellence)

Goal: lightweight, professional, fast. Proper alignment. **Keep every layout, feature, text and behavior as it is** — this is a polish pass, not a redesign.

## Hard constraints
- Edit ONLY the files you were assigned. Other agents are editing the other files at the same time.
- Change `className` strings (and at most wrapper-free, purely presentational attributes). Do NOT change logic, state, props, data flow, imports of server actions, routes, copy/text, or component structure. Do not add or remove elements unless it is a pure alignment fix (prefer zero).
- No new dependencies. No new CSS files. Do not edit `app/globals.css` or `components/ui.tsx` (shared; owned by the lead).
- Keep fonts as they are: Geist (`font-sans`, default), Geist Mono (`font-mono`), Newsreader (`font-display`, large headings only, always `font-normal`).
- Use only the theme tokens: `bg-background bg-surface bg-surface-hover border-border text-foreground text-muted text-link text-danger text-success ring-ring`. No raw hex colors. Must look right in both light and dark themes.
- Never remove focus styles, aria attributes, `sr-only` text, or `prefers-reduced-motion` handling.

## Typography (already normalized by the lead — keep it that way)
- Max **3 font sizes per screen**: `text-xs` (12px meta: timestamps, counts, badges, captions), `text-sm` (14px: body, labels, buttons, inputs, card titles, section headings), and ONE heading size (`font-display text-xl font-normal` for page/profile/job titles; standalone auth/error pages use `text-2xl`).
- **2 weights only**: `font-normal` (400) and `font-medium` (500). Never `font-semibold`/`font-bold`. Never arbitrary sizes like `text-[13px]`.
- Hierarchy comes from color (`text-foreground` vs `text-muted`) and weight, not more sizes.
- Numbers that change (counts, timers, scores): `tabular-nums`. Headlines: `text-balance`. Long user text: `break-words`. Paragraph prose: `text-pretty` and `leading-relaxed` where it is multi-line body text.
- Truncate single-line names/titles in flex rows with `min-w-0` on the flex child + `truncate`.

## Spacing & alignment (4px grid)
- Use the Tailwind scale on a 4px grid: 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12. Avoid odd values like 2.5/3.5/7 unless matching an existing neighbor.
- Page headers / card padding: horizontal padding must match between a header and the content below it (usually `px-4`), so left edges line up.
- Icons next to text: `items-center` on the row, `shrink-0` on the icon; icon sizes 14/16 with text-sm, 12/14 with text-xs.
- Rows of controls: consistent `gap-2` (tight) or `gap-3` (comfortable). Buttons in a row share the same height (`h-8` inline/toolbar, `h-10` form/primary).
- Avatars and text in list rows: `items-start` for multi-line, `items-center` for single-line, `gap-3`.
- Lists separated by `divide-y divide-border` or `border-b border-border` consistently; don't double borders.
- Radii: `rounded-md` (6px) controls/small tiles, `rounded-lg` (8px) buttons/inputs/menu rows, `rounded-xl` (12px) cards/dialogs. Keep a component's existing family consistent.
- Empty states: centered, `py-12`, muted text-sm, one line of help.

## Micro-interactions (CSS only, subtle, fast)
- Interactive elements: `transition-colors duration-150` (or the existing `btn*` classes from `components/ui.tsx`, which already have press-scale). Durations 120–200ms, ease-out. Never > 300ms for hover/press.
- Clickable rows/cards: `hover:bg-surface-hover` and `transition-colors`. Icon buttons: `motion-safe:active:scale-[0.94]`.
- Links: `hover:underline underline-offset-2` or color shift; consistent within a file.
- Anything that moves/scales must be gated with `motion-safe:`. No bouncy, no long, no parallax. No animating layout properties (width/height/top) — only opacity, transform, colors.
- Disabled: `disabled:opacity-50 disabled:pointer-events-none`.
- Focus: rely on the global `:focus-visible` outline or existing `focus-visible:ring-2 focus-visible:ring-ring`.

## Performance
- Don't add JS for visual effects. Don't add `will-change` broadly. No large shadows on scrolling lists (use borders). Images keep width/height to avoid layout shift.

## Finish
- Report: files changed and a short bullet list of what you changed and why. Do not run builds/dev servers (the lead verifies). Do not commit.
