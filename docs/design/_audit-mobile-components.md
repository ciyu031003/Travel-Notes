# Mobile Design-System Component Audit (fact-finding)

Scope: `components/mobile/` (20 files), `components/ui/` (7 files), `lib/mobile/icon-system.ts`,
`scripts/check-design-tokens.mjs`, plus `app/mobile.css` (613 lines) read as the class/token source of truth.
Every file listed above was read in full. Method for §7: `node scripts/check-design-tokens.mjs` and
`node scripts/check-design-tokens.mjs --json` executed from `F:\CodeFiles\Travel-Notes` (report mode, exit 0).

Total library surface: 27 files / 1,769 lines (mobile 1,390 · ui 379).

Related doc that already exists (not audited here): `docs/design/移动端设计规范.md`.

## 0. Cross-cutting facts

- **Two parallel token systems.** `components/mobile/*` consumes `--m-*` from `app/mobile.css`
  (`app/globals.css:1` = `@import './mobile.css';`). `components/ui/*` consumes the Tailwind
  `semantic.*` layer declared in `tailwind.config.js:22-36` → `var(--semantic-*)` defined in
  `app/globals.css:960-990` (`:root` light / `html.dark` dark). The two layers overlap in intent but
  not in values, e.g. `--m-accent: #C67A4E` (mobile.css:20) vs `--semantic-accent: #A85F3A`
  (globals.css:969); `--m-radius-card: 20px` vs `borderRadius['2xl']: '1.25rem'` (=20px);
  `--m-shadow-l1` vs `boxShadow.soft`.
- **No hex/rgba literals in any of the 27 files.** The checker reports `hexColor: 0` and
  `rgbaColor: 0` for both folders (§7.6). All colors arrive via `var(--m-*)`, `var(--semantic-*)`,
  Tailwind named colors (`text-white`, `bg-black/70`), or are defined inside `app/mobile.css`.
- **`components/ui/*` is almost entirely unimported.** Repo-wide, only `ui/Modal` (3 sites:
  `app/admin/page.tsx:13`, `components/home/DanmakuSection.tsx:6`, `components/social/MeHome.tsx:29`)
  and `ui/Select` (1 site: `app/admin/page.tsx:14`) are referenced. `ui/Button.tsx`, `ui/Card.tsx`,
  `ui/Badge.tsx`, `ui/Input.tsx` (incl. `Textarea`), `ui/SectionHeader.tsx` have **0 import sites**,
  and there is no barrel (`components/ui/` contains exactly the 7 files).
- **Import-site counts** (from `@/components/{ui,mobile}/X`): Icon 86 · LargeTitle 8 · Skeleton 7 ·
  Stagger 7 · PullToRefresh 7 · EmptyState 5 · BottomSheet 4 · CountUp 4 · ListRow 3 · Modal 3 ·
  StatBlock 2 · Pills 2 · IconBadge 2 · SegmentedControl 1 · IconButton 1 · Onboarding 1 · Select 1 ·
  Switch 1 · Toast 1 · MobilePageTransition 1.
- **Color literals that live inside `app/mobile.css` itself** (the checker never lints `.css`, only
  `.tsx/.ts` under `components/` and `app/`): `#E5484D` (`.m-action-item.is-danger`, line 541),
  `#FFFFFF` (`.m-chip-active` 253, `.m-switch-knob` 454, `.m-toast` 555),
  `#34C759` / `#FF453A` / `#64D2FF` (`.m-toast[data-kind=...] svg`, 560-562), plus `rgba()` in
  `.m-sheet-backdrop` (465), `.m-sheet` (485), `.m-toast` (554), `.m-skeleton::after` (391,396),
  `.m-shimmer` (315).
- **Classes defined in `app/mobile.css` that none of the 27 files use:** `.m-chip`, `.m-chip-active`,
  `.m-spring`, `.m-soft-pulse`, `.m-shimmer`, `.m-fab`, `.m-safe-top`, `.m-tab-label`,
  `.m-tab-active-dot` (+ keyframes `m-tab-pop`, `m-soft-pulse`, `m-shimmer`).

---

## 1-6. Per-component inventory

### 1. `components/mobile/ActionSheet.tsx` — 48 lines

- **Exports:** `ActionSheet`; `interface ActionSheetOption { label: string; destructive?: boolean; onClick?: () => void }`
- **Props:** `open: boolean` (req) · `onClose: () => void` (req) · `options: ActionSheetOption[]` (req) · `title?: string`
- **`m-*` classes:** `m-action-item` (line 37, 42), modifier `is-danger` / `is-cancel`. Renders through `BottomSheet`.
- **Vars:** none in-file (all geometry/color from `.m-action-item` in mobile.css:524-545).
- **States/variants:** per-option `destructive` → `.is-danger`; fixed cancel item `.is-cancel`; no size/disabled/loading.
- **Hardcoded in-file:** none color-wise; layout `flex flex-col gap-2.5 pb-2` (line 27). Destructive red is `#E5484D` in mobile.css:541, not a token.
- **Touch:** ✅ `.m-action-item { min-height: 48px }` (mobile.css:528). Real `<button type="button">`.
- **Reduced motion:** none in file; `.m-action-item` is inside the mobile.css `prefers-reduced-motion` block (line 609). `hapticLight()` fires on option click (line 33), not on cancel.

### 2. `components/mobile/BottomSheet.tsx` — 77 lines

- **Exports:** `BottomSheet`
- **Props:** `open: boolean` (req) · `onClose: () => void` (req) · `title?: string` · `children: ReactNode` (req) · `className?: string` · `dismissible?: boolean` **= true**
- **`m-*` classes:** `m-sheet-backdrop` (49), `m-sheet` (55), `m-sheet-grabber` (57), `m-sheet-head` (59), `m-title-2` (60), `m-sheet-close` (66), `m-sheet-body` (73); `text-[var(--m-text)]`.
- **Vars:** `var(--m-text)` only; all else from mobile.css.
- **States/variants:** `dismissible=false` removes ESC handling, backdrop click and the close button; header row renders only when `title` is set; `className` escapes onto `.m-sheet`; `open=false` → `return null` (line 38).
- **Hardcoded in-file:** `fixed inset-0 z-[95]` (line 41).
- **Touch:** ✅ `.m-sheet-close` is `width/height: 44px` (mobile.css:512-513). The backdrop is a full-screen `<button tabIndex={-1}>` (line 42-45) → not keyboard reachable.
- **Reduced motion:** `.m-sheet` / `.m-sheet-backdrop` are in the CSS reduced-motion block (line 608).
- Doc comment claims "拖拽把手" (drag handle) but the file has **no pointer/drag handlers**; the grabber is a static `<span aria-hidden>`.
- Locks `document.body.style.overflow` (30-34) and restores it; unlike `ui/Modal` it performs **no focus move/restore** and has no focus trap.

### 3. `components/mobile/CountUp.tsx` — 50 lines

- **Exports:** `CountUp`
- **Props:** `value: number` (req) · `duration?: number` **= 700** · `className?: string` · `mobileOnly?: boolean` **= false**
- **`m-*` classes:** none — renders `<span className={className}>` (line 49).
- **Vars:** none.
- **States/variants:** `duration <= 0` → instant; reduced-motion → instant; `mobileOnly` + `min-width: 768px` → instant; otherwise rAF easeOutCubic `1 - Math.pow(1 - progress, 3)` from `fromRef.current`.
- **Hardcoded:** `700`, exponent `3`, breakpoint `768`; no color.
- **Touch:** n/a (non-interactive).
- **Reduced motion:** ✅ explicit in JS — `if (duration <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches)` (line 28).

### 4. `components/mobile/EmptyState.tsx` — 36 lines

- **Exports:** `EmptyState`
- **Props:** `icon?: LucideIcon` · `title: string` (req) · `description?: string` · `action?: ReactNode` · `className?: string`
- **`m-*` classes:** `m-empty` (21), `m-empty-icon` (23), `m-title-2` (29), `m-caption` (31); `text-[var(--m-text)]`, `text-[var(--m-muted)]`.
- **Vars:** `--m-text`, `--m-muted` (the `m-empty-icon` box itself uses `var(--m-accent-soft)` / `var(--m-accent-strong)` from mobile.css:579-580).
- **States/variants:** optional icon block, description, action slot.
- **Hardcoded:** `max-w-[260px]`, `mt-1.5`, `mt-5` (lines 31, 33). Box geometry in CSS: 72×72, `border-radius: 24px`, `padding: 52px 24px`.
- **Touch:** n/a itself; `action` is caller-provided.
- **Reduced motion:** no animation present.

### 5. `components/mobile/Icon.tsx` — 63 lines

- **Exports:** `Icon` (named), `interface IconProps`, `export default Icon`
- **Props:** `icon: LucideIcon` (req) · `size?: IconSize` **= 'md'** (`'sm'|'md'|'lg'`) · `tone?: IconTone` **= 'inherit'** (`inherit|text|muted|faint|accent|inverse|success|warning|danger`) · `className?: string` · `style?: CSSProperties` · `label?: string`
- **`m-*` classes:** `m-icon`, `m-icon-${size}` (line 54).
- **Vars:** `TONE_CLASS` → `var(--m-text)`, `var(--m-muted)`, `var(--m-faint)`, `var(--m-accent)`, `var(--m-success)`, `var(--m-warning)`, `var(--m-danger)` (lines 22-29). `inverse: 'text-white'` is **not** a token (line 26).
- **States/variants:** 3 sizes × 9 tones; with `label` → `role="img"` + `aria-label`, without → `aria-hidden` (56-58).
- **Hardcoded:** numeric `width`/`height`/`strokeWidth` from `ICON_SIZE` / `ICON_STROKE` (`lib/mobile/icon-system.ts:73-74`: `{sm:16, md:20, lg:24}`, `{sm:2, md:2, lg:1.75}`). No hex.
- **Touch:** n/a.
- **Reduced motion:** no animation.

### 6. `components/mobile/IconBadge.tsx` — 64 lines

- **Exports:** `IconBadge`, `export default IconBadge`
- **Props:** `icon: LucideIcon` (req) · `tone?: BadgeTone` **= 'accent'** · `size?: IconSize` **= 'md'** · `shape?: 'squircle'|'circle'` **= 'squircle'** · `className?: string` · `label?: string`
- **`m-*` classes:** none — uses Tailwind boxes: `BOX_CLASS {sm:'h-8 w-8', md:'h-10 w-10', lg:'h-12 w-12'}` (20-24) and `RADIUS_CLASS {sm:'rounded-[10px]', md:'rounded-[14px]', lg:'rounded-[16px]'}` (26-30).
- **Vars:** via `BADGE_TONE_CLASS` (`icon-system.ts:97-103`) → `--m-tone-{accent,sun,blush,clay,neutral}-{bg,fg}` (10 vars).
- **States/variants:** 3 sizes × 2 shapes × 5 tones. Glyph is clamped: `<Icon icon={icon} size={size === 'lg' ? 'md' : size} />` (line 59) — an `lg` badge shows a 20px glyph.
- **Hardcoded:** `rounded-[10px]`, `rounded-[14px]`, `rounded-[16px]` — arbitrary radius values; `10/14/16` are exactly the allowlist entries in the checker (`check-design-tokens.mjs:238`), so they are not flagged.
- **Touch:** n/a (`<span>`).
- **Reduced motion:** no animation.

### 7. `components/mobile/IconButton.tsx` — 71 lines

- **Exports:** `IconButton`, `export default IconButton`
- **Props:** `icon: LucideIcon` (req) · `label: string` (req) · `onClick?: () => void` · `variant?: 'plain'|'surface'|'glass'|'accent'` **= 'surface'** · `tone?: IconTone` · `size?: 'sm'|'md'` **= 'md'** · `className?: string` · `disabled?: boolean` · `type?: 'button'|'submit'` **= 'button'**
- **`m-*` classes:** `m-pressable` (57), `m-glass` (22). Tailwind/size: `min-h-11 min-w-11`, `h-11 w-11`, `rounded-full`.
- **Vars:** `text-[var(--m-muted)]`, `active:bg-[var(--m-surface-2)]`, `bg-[var(--m-surface-solid)]`, `border-[var(--m-line)]`, `text-[var(--m-text)]`, `bg-[var(--m-accent)]` (20-23); `accent` variant also uses `text-white`.
- **States/variants:** 4 variants; `disabled` → `opacity-40` (62); `size` changes only the glyph (`sm`→16px, else 20px, line 66).
- **Hardcoded:** line 60 — `size === 'sm' ? 'h-11 w-11' : 'h-11 w-11'`; both branches are identical, so the button box is always 44×44.
- **Touch:** ✅ `min-h-11 min-w-11` + `h-11 w-11` = 44×44 (comment line 58: "44px 最小触达"). `aria-label` + `title` always set.
- **Reduced motion:** `.m-pressable` is CSS-covered (line 608). `onPointerDown={() => void hapticLight()}` (55) is **not gated on `disabled`**.

### 8. `components/mobile/LargeTitle.tsx` — 66 lines

- **Exports:** `LargeTitle`
- **Props:** `title: string` (req) · `subtitle?: string` · `trailing?: ReactNode` · `back?: boolean | string` · `className?: string`
- **`m-*` classes:** `m-title` (46), `m-pressable` (52), `m-title-1` (58), `m-caption` (60); `text-[var(--m-text)]`, `text-[var(--m-muted)]`.
- **Vars:** `--m-text`, `--m-muted`.
- **States/variants:** `back` falsy → no button; `back === true` → history back else no-op; `back === "/me"` → `router.replace(back)` when `window.history.length <= 1` (38-43).
- **Hardcoded:** `-ml-2`, `h-11 w-11` (line 52). `.m-title` itself hardcodes `padding: 20px 20px 14px` (mobile.css:404) rather than `var(--m-gutter)`.
- **Touch:** ✅ back button `h-11 w-11` = 44×44; `trailing` slot is caller-controlled.
- **Reduced motion:** none in file; `.m-pressable` CSS-covered (608).

### 9. `components/mobile/ListRow.tsx` — 105 lines

- **Exports:** `ListSection`, `ListRow`, `export default ListRow`
- **`ListSection` props:** `title?: string` · `action?: ReactNode` · `children: ReactNode` (req) · `className?: string`
- **`ListRow` props:** `icon: LucideIcon` (req) · `tone?: BadgeTone` **= 'accent'** · `title: string` (req) · `description?: string` · `href?: string` · `onClick?: () => void` · `trailing?: ReactNode` · `showChevron?: boolean` **= true** · `className?: string`
- **`m-*` classes:** `m-gutter` (39), `m-section-title` (41), `m-card-flat` (46), `m-pressable` (86), `m-body` (77), `m-caption` (79); `divide-[var(--m-line)]`, `text-[var(--m-text)]`, `text-[var(--m-muted)]`.
- **Vars:** `--m-line`, `--m-text`, `--m-muted`.
- **States/variants:** three render modes — `<Link>` when `href` (90), `<button>` when `onClick` (97), `<div>` otherwise (102); `trailing` replaces the chevron; `showChevron`; row tone via `IconBadge`.
- **Hardcoded:** `min-h-[64px]`, `px-4 py-3`, `gap-4`, `divide-y` (line 86).
- **Touch:** ✅ `min-h-[64px]`. `hapticLight()` is wired **only** on the `Link` branch (line 90); the `onClick` button branch (97) has no haptic call.
- **Reduced motion:** none in file; `.m-pressable` CSS-covered (608).

### 10. `components/mobile/MobilePageTransition.tsx` — 45 lines

- **Exports:** `MobilePageTransition`
- **Props:** `children: ReactNode` (req) · `className?: string`
- **`m-*` classes:** `m-page-fade` added/removed imperatively via `el.classList` (34, 37); wrapper is `flex min-h-0 flex-1 flex-col` (41).
- **Vars:** none.
- **States/variants:** plays only when `(max-width: 767px)` matches (31); first mount skipped via `firstRun` ref (27-30); replay forced by `void el.offsetWidth` (36).
- **Hardcoded:** breakpoint `767`; no colors.
- **Touch:** n/a.
- **Reduced motion:** not in TS; `.m-page-fade` is CSS-covered (609).

### 11. `components/mobile/Onboarding.tsx` — 165 lines

- **Exports:** `Onboarding`, `export default Onboarding`; module-local `STORAGE_KEY = 'tiantu-onboard-seen-v1'` (27), `interface Slide`, `SLIDES` (37-59, 3 entries, Chinese copy).
- **Props:** **none** (`export function Onboarding()`).
- **`m-*` classes:** `m-pressable` (117), `m-caption` (120, 157), `m-label` (129), `m-display` (130), `m-body` (131, 151), `m-press` (151); `bg-[var(--m-bg)]`, `text-[var(--m-text)]`, `text-[var(--m-muted)]`, `text-[var(--m-accent-strong)]`, `bg-[var(--m-accent)]`, `bg-[var(--m-faint)]`.
- **Vars:** `--m-bg`, `--m-text`, `--m-muted`, `--m-accent`, `--m-accent-strong`, `--m-faint`.
- **States/variants:** slide index 0-2; last slide → label `开始记录` and no chevron (153-154); visibility gated on `pathname === '/'` + `localStorage` (70-81); `md:hidden` (107) desktop isolation.
- **Hardcoded:** `z-[60]` (107), `max-w-[300px]` (131), `h-20 w-20` overriding the `IconBadge` size (127), `min-h-12` (151), `h-1.5`/`w-1.5`/`w-6` (141-142), `pt-[max(16px,env(safe-area-inset-top))]` (113), `pb-[max(28px,env(safe-area-inset-bottom))]` (135), `transition-all duration-300` (141).
- **Touch:** ✅ skip button `h-11` (44px, line 117); CTA `min-h-12` (48px, line 151); dots are `aria-hidden`.
- **Reduced motion:** ⚠️ the dot `transition-all duration-300` (141) is a Tailwind utility, not in the mobile.css reduced-motion list (`.m-press` *is* listed, line 607). `hapticSuccess()` on completion, `hapticLight()` on next/skip.

### 12. `components/mobile/Pills.tsx` — 121 lines

- **Exports:** `Pill`, `TravelTypePill`, `ActivityPill`, `ItineraryChip` (no default)
- **`Pill` props:** `icon?: LucideIcon` · `tone?: BadgeTone` **= 'neutral'** · `children: React.ReactNode` (req) · `size?: 'sm'|'md'` **= 'md'** · `className?: string`
- **`TravelTypePill` props:** `type?: string | null` · `size?` · `className?` (returns `null` when `!type`, line 70)
- **`ActivityPill` props:** `kind: ActivityKind` (req) · `size?` · `className?`
- **`ItineraryChip` props:** `type?: string | null` · `locationName?: string | null` · `children: React.ReactNode` (req) · `size?` · `className?`
- **`m-*` classes:** none — `rounded-full` + `SIZE_CLASS` (27-30): `sm: 'h-6 gap-1 px-2 text-[11px]'`, `md: 'h-7 gap-1.5 px-2.5 text-[13px]'`.
- **Vars:** via `BADGE_TONE_CLASS` → `--m-tone-*-{bg,fg}`.
- **States/variants:** 2 sizes × 5 tones; `ItineraryChip` appends `（locationName）` and an `sr-only` type label (117-118).
- **Hardcoded:** `h-6` (24px), `h-7` (28px), `text-[11px]`, `text-[13px]` — both font sizes are in the checker's `ALLOWED_FONT_SIZES`.
- **Touch:** n/a — non-interactive `<span>` labels; heights 24/28px.
- **Reduced motion:** no animation.

### 13. `components/mobile/Pressable.tsx` — 34 lines

- **Exports:** `Pressable` (forwardRef), `interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> { haptics?: boolean }`
- **Props:** all native button attributes via `...rest`, plus `haptics?: boolean` **= true** (destructured, line 16)
- **`m-*` classes:** `m-pressable` only (30).
- **Vars:** none.
- **States/variants:** `haptics` on/off; all other states come from the spread. `type="button"` is hardcoded at line 27 but `{...rest}` is spread **after** it (31), so a caller-supplied `type` wins.
- **Hardcoded:** none.
- **Touch:** ⚠️ **no built-in size** — comment line 13: "44px 由使用方按需设置".
- **Reduced motion:** `.m-pressable` CSS-covered (608).

### 14. `components/mobile/PullToRefresh.tsx` — 102 lines

- **Exports:** `PullToRefresh`
- **Props:** `onRefresh: () => Promise<unknown> | void` (req) · `children: ReactNode` (req) · `className?: string` · `style?: CSSProperties` · `disabled?: boolean`
- **`m-*` classes:** `m-ptr` (70), `m-ptr-indicator` (78), `m-ptr-spin` (85). Uses raw lucide `RefreshCw`, **not** the `Icon` component (84-87).
- **Vars:** none in-file; the indicator color comes from `.m-ptr-indicator { color: var(--m-muted) }` (mobile.css:596).
- **States/variants:** `下拉刷新` / `松开刷新` / `刷新中…` (89); `refreshing`, `disabled`; indicator transform `translateY(max(0, dist - 48))` and `opacity: min(1, dist / THRESHOLD)` (80-81).
- **Hardcoded:** `const THRESHOLD = 56`, `const MAX_PULL = 96` (14-15), damping `0.42` (47), `dist - 48` (80), inline `transition: dist === 0 ? 'none' : 'transform 0.02s linear'` (95), `strokeWidth={2}` + `h-5 w-5` (85), `ml-2` (88), and **`text-[12px]` (88)** — one of only two `fontSize` violations inside the audited library.
- **Touch:** ⚠️ touch-only (`onTouchStart`/`onTouchMove`/`onTouchEnd`, 72-74). The wrapper `<div>` has no `role`/`tabIndex`, no button, no keyboard path. Indicator is `aria-hidden`.
- **Reduced motion:** none in TS; `.m-ptr-spin` CSS-covered (609). The JS-driven `translateY` of the content wrapper is not gated.

### 15. `components/mobile/SegmentedControl.tsx` — 61 lines

- **Exports:** `SegmentedControl` (generic `<T extends string>`), `interface SegmentOption<T> { value: T; label: string }`
- **Props:** `value: T` (req) · `options: SegmentOption<T>[]` (req) · `onChange: (value: T) => void` (req) · `className?: string`
- **`m-*` classes:** `m-seg` (31), `m-seg-item` (48), `is-active` (48), `m-seg-thumb` (56).
- **Vars:** **sets** `--m-seg-count` inline (25), consumed by `.m-seg-thumb { width: calc((100% - 6px) / var(--m-seg-count, 2)) }` (mobile.css:437).
- **States/variants:** active/inactive item (`.is-active`); thumb `translateX(${index * 100}%)` (57); `role="tablist"` + `role="tab"` + `aria-selected` (no `aria-controls`/`tabpanel`).
- **Hardcoded:** none in-file. Track geometry from CSS: `border-radius: 999px`, `padding: 3px`.
- **Touch:** ⚠️ `.m-seg-item { min-height: 36px }` (mobile.css:419) — below 44px; items are `flex: 1` so width is fine.
- **Reduced motion:** `.m-seg-thumb` is CSS-covered (608); `hapticSelection()` only when `!active` (44).
- `.m-seg-item:not(.is-active):active { transform: scale(0.95) }` (mobile.css:429-431) — `.m-seg-item` itself is **not** in the reduced-motion selector list.

### 16. `components/mobile/Skeleton.tsx` — 34 lines

- **Exports:** `Skeleton`, `SkeletonLines`, `SkeletonCard`
- **`Skeleton` props:** `className?: string` · `style?: CSSProperties`
- **`SkeletonLines` props:** `lines?: number` **= 3** · `className?: string`
- **`SkeletonCard` props:** `className?: string`
- **`m-*` classes:** `m-skeleton` (6), `m-card` (29).
- **Vars:** none inline; `.m-skeleton { background: var(--m-surface-2); border-radius: var(--m-radius-sm) }` (mobile.css:384-385).
- **States/variants:** line count; widths cycle `[100, 92, 78][index % 3] + '%'` (20); `SkeletonCard` = `h-40` cover + 2 lines.
- **Hardcoded:** `h-3 w-full` (20), `h-40 w-full` (30), `p-4` (29), `mt-3.5` (31), `gap-2` (18).
- **Touch:** n/a — every element is `aria-hidden="true"`.
- **Reduced motion:** ✅ transitively — `.m-skeleton::after` (the shimmer) is in the CSS reduced-motion list (609); also `html.dark .m-skeleton::after` overrides the gradient (395-397).

### 17. `components/mobile/Stagger.tsx` — 49 lines

- **Exports:** `Stagger`
- **Props:** `children: ReactNode` (req) · `step?: number` **= 36** · `delayBase?: number` **= 0** · `className?: string` · `style?: CSSProperties`
- **`m-*` classes:** injects `m-list-item` on each valid child unless its existing className already contains `m-enter` (41-43).
- **Vars:** **sets** `--m-delay` per child style (`delay = delayBase + index * step`, lines 38-39), consumed by `.m-enter` / `.m-list-item` `animation-delay: var(--m-delay, 0ms)` (mobile.css:290, 326).
- **States/variants:** delay ladder; `cloneElement(child as any, ...)` with an `eslint-disable` (44-45).
- **Hardcoded:** `36`, `0`.
- **Touch:** n/a.
- **Reduced motion:** ✅ `.m-list-item` is CSS-covered (607) **and** the animation is media-gated to `@media (max-width: 767.98px)` (mobile.css:330-335) so desktop gets no animation.

### 18. `components/mobile/StatBlock.tsx` — 87 lines

- **Exports:** `StatBlock`, `export default StatBlock`, `StatRow`
- **`StatBlock` props:** `value: number | string` (req) · `unit?: string` · `label?: string` · `icon?: LucideIcon` · `tone?: IconTone` **= 'accent'** · `href?: string` · `className?: string`
- **`StatRow` props:** `items: Array<{ value: ReactNode; unit: string }>` (req) · `className?: string`
- **`m-*` classes:** `m-stat` (41), `m-caption` (43, 47, 75), `m-pressable` (57); plus `tabular-nums`.
- **Vars:** `text-[var(--m-accent-strong)]`, `text-[var(--m-muted)]`, `text-[var(--m-text)]`.
- **States/variants:** with/without `unit`, `label`, `icon`; `href` → `<Link>` with `m-pressable` (57), otherwise a plain `<div>`.
- **Hardcoded:** `pb-1`, `mt-1`, `gap-1.5`, `mx-1.5 opacity-50` and the `·` separator character (78).
- **Touch:** ⚠️ the `Link` branch has no min-height; hit area equals content height (`.m-stat` is 32px line-height).
- **Reduced motion:** none in file; `.m-pressable` CSS-covered (608).

### 19. `components/mobile/Switch.tsx` — 64 lines

- **Exports:** `Switch`
- **Props:** `checked: boolean` (req) · `onCheckedChange: (next: boolean) => void` (req) · `disabled?: boolean` · `label?: string` · `description?: string` · `className?: string`
- **`m-*` classes:** `m-switch` (58), `is-on` / `is-off` (58), `m-switch-knob` (60).
- **Vars:** inline style `background: 'var(--m-surface-solid)'`, `border: '1px solid var(--m-line)'` (39-42); CSS `.m-switch.is-on → var(--m-accent)`, `.is-off → var(--m-line-strong)` (447-452), `.m-switch-knob { background: #FFFFFF }` (454).
- **States/variants:** checked/unchecked; `disabled` → `opacity-50`; optional label/description; `role="switch"` + `aria-checked` + `aria-label={label || '开关'}`.
- **Hardcoded:** row `min-h-[52px] rounded-2xl px-4 py-2.5` (35), track `h-8 w-12` (48×32) with `p-[3px]` (58), knob `h-[26px] w-[26px]` (60), label `text-[15px]`, description `text-[12px]` (47, 50). The surface/border are applied as **inline styles** rather than classes.
- **Touch:** ✅ whole row `min-h-[52px]`; the `<button>` is the full-width row.
- **Reduced motion:** none in file; `.m-switch` and `.m-switch-knob` are CSS-covered (608), which kills the `translateX(16px)` knob transition.
- `text-[12px]` (line 50) is the second `fontSize` violation inside the audited library.

### 20. `components/mobile/Toast.tsx` — 48 lines

- **Exports:** `ToastHost` (no default)
- **Props:** **none**. Subscribes to `subscribeToasts` from `lib/mobile/toast-store.ts`; item shape `ToastItem { id: number; kind: 'info'|'success'|'error'; message: string; duration: number }` (that file's `ToastKind`).
- **`m-*` classes:** `m-toast` + `m-enter` (32); `data-kind={item.kind}` drives color.
- **Vars:** none in-file; `.m-toast` uses `rgba(42, 30, 22, 0.92)` + `#FFFFFF`, and per-kind `svg` colors `#34C759` / `#FF453A` / `#64D2FF` (mobile.css:554-562).
- **States/variants:** 3 kinds (`ICONS` map, lines 9-13); stacked list; auto-dismiss from the store (`2600ms`, `error` `3400ms`).
- **Hardcoded:** `top-[max(12px,env(safe-area-inset-top))]`, `z-[120]`, `gap-2`, `px-4`, `text-[13px]` (27, 34), close-button `opacity-60 transition-opacity hover:opacity-100` (39).
- **Touch:** ⚠️ the close button is a bare `<Icon icon={X} size="sm" />` (16px) inside a padding-less `<button>` (35-42) — no 44px target.
- **Reduced motion:** `.m-enter` is CSS-covered (607).

---

### 21. `components/ui/Badge.tsx` — 36 lines

- **Exports:** `export default Badge` (no named export); local `type Tone = 'default' | 'accent' | 'neutral'`
- **Props:** `children: ReactNode` (req) · `tone?: Tone` **= 'default'** · `className?: string`
- **Classes:** `tones` (6-13) — `default: 'bg-semantic-accentWeak text-semantic-accentStrong'`, `accent: 'bg-semantic-accentWeak text-semantic-accent'`, `neutral: 'bg-semantic-surface2 text-semantic-muted border border-semantic-line'`; base `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium`.
- **Vars:** `--semantic-accent-weak`, `--semantic-accent-strong`, `--semantic-accent`, `--semantic-surface2`, `--semantic-muted`, `--semantic-line`.
- **States/variants:** 3 tones only; no size/disabled/loading.
- **Hardcoded:** none; height ≈ `py-1` (8px) + `text-xs` line-height 16px = 24px.
- **Touch:** n/a (non-interactive `<span>`), 24px tall.
- **Reduced motion:** no animation.

### 22. `components/ui/Button.tsx` — 66 lines

- **Exports:** `export default Button`; local `type Variant = 'primary'|'secondary'|'ghost'|'danger'`, `type Size = 'md'|'lg'`
- **Props:** `children: ReactNode` (req) · `variant?: Variant` **= 'primary'** · `size?: Size` **= 'md'** · `className?: string` · `href?: string` · `onClick?: () => void` · `type?: 'button'|'submit'` **= 'button'** · `disabled?: boolean` · `'aria-label'?: string`
- **Classes:** base (10-11) `inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-40 disabled:pointer-events-none`; variants (13-22) — `primary: 'bg-semantic-accent text-semantic-onAccent rounded-xl hover:bg-semantic-accentStrong shadow-lg shadow-travel-accent/20'`, `secondary: 'bg-semantic-accentWeak text-semantic-accentStrong rounded-xl hover:bg-semantic-accentWeak/70'`, `ghost: 'text-semantic-text rounded-xl hover:bg-semantic-accentWeak hover:text-semantic-heading'`, `danger: 'bg-travel-danger/10 text-travel-danger rounded-xl hover:bg-travel-danger/20'`; sizes (24-27) `md: 'px-5 py-2.5 text-sm'`, `lg: 'px-6 py-3.5 text-base'`.
- **Vars:** `--semantic-accent`, `--semantic-on-accent`, `--semantic-accent-strong`, `--semantic-accent-weak`, `--semantic-text`, `--semantic-heading`; `travel-danger` = `#ef4444` (tailwind.config.js:133, not a CSS var).
- **States/variants:** 4 variants × 2 sizes; `disabled`; `href` switches to `<Link>`.
- ⚠️ **`disabled`, `type` and (React) button semantics are dropped in the `href` branch** (54-60) — the `Link` receives only `className`, `aria-label`, `onClick`.
- **Hardcoded:** `rounded-xl` (=0.875rem=14px per config override), `shadow-lg` (Tailwind default), no hex in-file. Heights: `md` = py-2.5 (10+10) + 20px line-height = **40px**; `lg` = py-3.5 (14+14) + 24px = **52px**.
- **Touch:** ⚠️ `md` (default) ≈40px < 44px; `lg` ≈52px ≥ 44px. No haptics, no `m-*` classes, no mobile tokens.
- **Reduced motion:** `transition-all` with no `motion-safe`/`motion-reduce` guard; the mobile.css reduced-motion block lists only `m-*` selectors.

### 23. `components/ui/Card.tsx` — 15 lines

- **Exports:** `Card` (named, no default)
- **Props:** `HTMLAttributes<HTMLDivElement>` — `className`, `children`, and any div attribute, spread `{...props}` (12).
- **Classes:** `rounded-2xl border border-semantic-line bg-semantic-surface p-5 shadow-soft` (9).
- **Vars:** `--semantic-line`, `--semantic-surface`; `shadow-soft` = `0 10px 28px rgba(90,102,112,0.08)` (tailwind.config.js:171, mirrored at globals.css:126).
- **States/variants:** none (className only).
- **Hardcoded:** `p-5`, `rounded-2xl` (=1.25rem=20px — numerically equal to `--m-radius-card`, but not referencing it); the shadow rgba lives in the config, not the file.
- **Touch:** n/a (container).
- **Reduced motion:** n/a.

### 24. `components/ui/Input.tsx` — 61 lines

- **Exports:** `Input`, `Textarea`; local `interface InputFieldProps { label?: string; hint?: string; required?: boolean }`
- **Props:** `InputHTMLAttributes<HTMLInputElement> & InputFieldProps`; `TextareaHTMLAttributes<HTMLTextAreaElement> & InputFieldProps`. `id` is used as `const inputId = id || props.name` (24, 48).
- **Classes:** `inputBase` (6-7) `w-full rounded-xl border border-semantic-line bg-semantic-surface px-4 py-2.5 text-sm text-semantic-text placeholder-semantic-faint shadow-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-semantic-accentSoft/50`; `Textarea` adds `resize-none py-3` (57); label `mb-1.5 block text-sm font-medium text-semantic-text`; required mark `text-travel-danger` (30, 54); hint `mt-1 text-xs text-semantic-faint` (34, 58).
- **Vars:** `--semantic-line`, `--semantic-surface`, `--semantic-text`, `--semantic-faint`, `--semantic-accent-soft`; `travel-danger` = `#ef4444` from config.
- **States/variants:** label/hint/required presence; Input vs Textarea. **No error/invalid variant, no disabled styling** — focus ring is the only state style.
- **Hardcoded:** `py-2.5`, `rounded-xl`, `ring-2 …/50`, `shadow-sm`. No hex.
- **Touch:** ⚠️ field height ≈40px (py-2.5 + 20px line-height); Textarea `py-3` is taller.
- **Reduced motion:** `transition-all` unguarded.

### 25. `components/ui/Modal.tsx` — 112 lines

- **Exports:** `Modal` (named); `interface ModalProps` is local, **not exported**
- **Props:** `open: boolean` (req) · `onClose: () => void` (req) · `title?: string` · `children: ReactNode` (req) · `className?: string` · `closeOnBackdrop?: boolean` **= true** · `showClose?: boolean` **= true** · `footer?: ReactNode`
- **Classes:** shell `fixed inset-0 z-[100] flex items-center justify-center p-4` (68); backdrop `absolute inset-0 bg-black/70 backdrop-blur-sm` (74); panel `relative w-full max-w-md rounded-2xl bg-semantic-surface p-5 shadow-xl outline-none` + `motion-safe:animate-scale-in` (81-84); close button `ml-auto rounded-full p-1 text-semantic-muted transition hover:bg-semantic-accentWeak hover:text-semantic-text` (99).
- **Vars:** `--semantic-surface`, `--semantic-heading`, `--semantic-muted`, `--semantic-accent-weak`.
- **States/variants:** backdrop-close on/off; close-button on/off; title present/absent (header row renders if `title || showClose`, 87); footer present/absent; `className` overrides panel width.
- **Hardcoded:** `z-[100]`, `bg-black/70`, `p-4`, `max-w-md`, `mb-4`, `gap-2`, close button `p-1`.
- **Touch:** ⚠️ close button ≈24px (`p-1` + 16px icon) < 44px. Panel is `tabIndex={-1}` and focused on open (47).
- **Reduced motion:** ✅ `motion-safe:animate-scale-in` (83).
- Behavior: `createPortal(..., document.body)` (66, 110), scroll lock + focus restore to `lastFocused` (42-52), ESC listener (55-62); **no focus trap** (Tab can leave the panel).

### 26. `components/ui/SectionHeader.tsx` — 39 lines

- **Exports:** `export default SectionHeader`
- **Props:** `eyebrow?: string` · `title: ReactNode` (req) · `subtitle?: string` · `action?: ReactNode` · `className?: string`
- **Classes:** wrapper `flex flex-col gap-1 ${className || ''}` (18 — string interpolation, not `cn()`); eyebrow `text-xs font-medium uppercase tracking-[0.28em] text-semantic-accent` (22); title `mt-1 font-display text-xl font-semibold tracking-tight text-semantic-heading md:text-2xl` (26); subtitle `mt-1 text-sm leading-relaxed text-semantic-muted` (33).
- **Vars:** `--semantic-accent`, `--semantic-heading`, `--semantic-muted`; `font-display` = `fontFamily.display` = `'Noto Serif SC', 'Songti SC', STSong, SimSun, serif` (tailwind.config.js:136).
- **States/variants:** eyebrow/subtitle/action presence; responsive title `text-xl` → `md:text-2xl`.
- **Hardcoded:** `tracking-[0.28em]` (22), `gap-1`, `mt-1`. **Value conflict to note:** `app/mobile.css:141` documents "英文眉标字距统一 0.08em（不再用 0.24em）" (and `.m-label` uses `letter-spacing: 0.08em`), while this component uses `0.28em`.
- **Touch:** n/a (non-interactive).
- **Reduced motion:** no animation.

### 27. `components/ui/Select.tsx` — 50 lines

- **Exports:** `Select` (named); local `interface SelectFieldProps { label?: string; hint?: string; required?: boolean }`
- **Props:** `SelectHTMLAttributes<HTMLSelectElement> & SelectFieldProps`; `const selectId = id || props.name` (24).
- **Classes:** select `w-full appearance-none rounded-xl border border-semantic-line bg-semantic-surface px-4 py-2.5 pr-9 text-sm text-semantic-text shadow-sm transition-all`, `focus:border-transparent focus:outline-none focus:ring-2 focus:ring-semantic-accentSoft/50`, `[&>option]:bg-semantic-surface` (36-40); chevron `pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-semantic-faint` (45); label/hint/required identical to `ui/Input`.
- **Vars:** `--semantic-line`, `--semantic-surface`, `--semantic-text`, `--semantic-faint`, `--semantic-accent-soft`.
- **States/variants:** label/hint/required presence; native select states; no custom dropdown (native `<select>` with `appearance-none`).
- **Hardcoded:** `py-2.5`, `pr-9`, `right-3`, `rounded-xl`.
- **Touch:** ⚠️ ≈40px tall (`py-2.5` + 20px line-height) < 44px.
- **Reduced motion:** `transition-all` unguarded.
- Imports the **mobile** `Icon` (`@/components/mobile/Icon`, line 5) — one of the two cross-layer importers (`ui/Modal` is the other).

---

## 7. What `scripts/check-design-tokens.mjs` actually validates

### 7.1 Configuration constants (lines 21-76)

| Constant | Value |
|---|---|
| `ROOT` | `process.cwd()` |
| `SCAN_DIRS` | `['components', 'app']` — note `lib/` is **not** scanned, so `lib/mobile/icon-system.ts` can never be linted even though it is listed in `ICON_SYSTEM_ALLOWLIST` (line 49) |
| `EXTS` | `new Set(['.tsx', '.ts'])` — `.css`, `.js`, `.mjs` are never linted |
| `STRICT` / `JSON_OUT` | `process.argv.includes('--strict')` / `('--json')` |
| `THEME_ALLOWLIST` (34-41) | `components/album/sketchbook/`, `components/album/space/`, `components/album/pixel`, `components/album/reader/`, `components/admin/`, `app/admin/` — matched with `rel.startsWith(a)`; hits are pushed to `infoFindings` instead of `findings` |
| `ICON_SYSTEM_ALLOWLIST` (47-51) | `components/mobile/Icon.tsx`, `lib/mobile/icon-system.ts`, `app/dev/ui/` — exempts **only** the `lucideImport` rule |
| `ALLOWED_FONT_SIZES` (54-56) | `{32, 24, 18, 15, 13, 11}` |
| `PALETTE_FILES` (65-68) | `components/china-map/types.ts`, `components/travel-info/types.ts` |
| `RENDER_VALUE_FILES` (69-76) | `components/album/StarfieldBackground.tsx`, `components/album/space/`, `components/album/driftwall/`, `components/album/morphslider/`, `components/home/HeroFootprintMap.tsx`, `components/china-map/ChinaMap` — used only to annotate `renderValue` on hex hits |

### 7.2 Token index (lines 84-107)

Reads `app/globals.css` and `app/mobile.css`; regex
`/(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g` → map `value → [names]`, with 4-digit hex expanded
(`#abc` → `#aabbcc`). Only **hex-valued** custom properties are indexed; `rgba()`-valued tokens
(`--m-surface`, `--m-accent-soft`, all `--m-tone-*-bg`, `--semantic-accent-weak`, …) are invisible to it.

### 7.3 The seven rules (buckets)

| # | Bucket | Detection logic | Allowlist / conditions |
|---|---|---|---|
| 1 | `hexColor` | `HEX_RE = /#[0-9a-fA-F]{3,8}\b/g` per line (117, 214) | Skipped when `isLegitLiteral` matches `content=["']#…["']` (`meta`) or the file is in `PALETTE_FILES` (`palette`) → `infoFindings`. Each hit is classified by `classifyHex`: `duplicatesToken` when the (normalized) value equals a token value, else `unmatched`; `renderValue` flag added from `RENDER_VALUE_FILES`; `paletteFile` is hardcoded `false` (226) |
| 2 | `rgbaColor` | `RGBA_RE = /\brgba?\(/g` (118, 229) | **No** legit-literal escape and no palette/render exemption — only `THEME_ALLOWLIST` downgrades it. Detail text is just `rgba(` |
| 3 | `lucideImport` | `LUCIDE_IMPORT_RE = /from\s+['"]lucide-react['"]/` (119, 230) | Skipped for `ICON_SYSTEM_ALLOWLIST` files. Does **not** distinguish `import type { LucideIcon }` from value imports |
| 4 | `fontSize` | `FONT_SIZE_RE = /text-\[(\d+(?:\.\d+)?)px\]/g` (121, 232); flagged when `Number(px)` ∉ `ALLOWED_FONT_SIZES` | Only arbitrary `text-[Npx]` values are inspected; Tailwind scale classes (`text-xs`, `text-sm`) and `tracking-[…]`/`text-[0.875rem]` are never checked |
| 5 | `charIcon` | `CHAR_ICON_RE = /[✦✨✍★☆♡❤️🔥⭐️]/u` (116, 231) | None |
| 6 | `iconSize` | Per-file regex built from the file's **actual** lucide imports (187-199): `<(Name1\|Name2\|…)\b[^>]*className="[^"]*\b[hw]-\d`, plus a guard `!/m-icon/.test(line)` (241). `LUCIDE_JSX_SIZE_RE` (line 120) is declared but **never used**. The regex is applied per line, so the JSX tag and `className="…"` must be on the same line **and** `className` must be a double-quoted literal | A `className={cn('h-5 w-5', …)}` (PullToRefresh.tsx:85) does not match |
| 7 | `magicRadius` | `MAGIC_RADIUS_RE = /rounded-\[(\d+(?:\.\d+)?)px\]/g` (122, 236); flagged when `px` ∉ `[20, 14, 12, 24, 10, 16]` | Inline allowlist at line 238 |

Comment handling: any line whose trimmed text starts with `*`, `//` or `/*` is skipped entirely (204-206);
trailing comments on code lines are still scanned.

### 7.4 Output, counting and exit codes

- Buckets → `LABELS` (247-255); `summary` counts **distinct `file:line` locations**, not files:
  `new Set(v.map((r) => r.at)).size` (258). The printed caption "待处理文件数" therefore reports
  locations. `total` (281) sums those seven numbers.
- `--json` prints `{ summary, infoSummary, findings }` and always `process.exit(0)` (267-270).
- Report mode prints the buckets, the theme-allowlist `infoSummary`, and splits unmatched hex into
  ① duplicatesToken (count of locations + top 8 `hex → token` pairs), ② render parameters
  (`renderValue` only, since `paletteFile` is always false), ③ `realGap` (list capped at 6 files).
- `--strict` → `console.error('❌ 存在设计规范违规（--strict 模式）')` + `exit(1)` when `total > 0` (331-334).

### 7.5 Current run (executed from the repo root)

```
移动端设计规范一致性检查 — 扫描 327 个文件（components/ + app/）
hexColor 81 · rgbaColor 53 · lucideImport 96 · fontSize 67 · charIcon 2 · iconSize 0 · magicRadius 9
主题豁免: hex 55 · rgba 19 · lucide 26 · fontSize 6 · iconSize 192
hex 分类: ① 与既有 token 同值 29 处 / 12 文件   ② 渲染参数 8 处 / 4 文件   ③ 未匹配 65 处 / 32 文件
待处理合计: 308（= 81+53+96+67+2+0+9，实际为 file:line 位置数）
报告模式：未失败。CI 请加 --strict。
```
Top duplicate hexes: `#A85F3A → --color-travel-accent` ×5 · `#C97E55 → --color-travel-accent-soft` ×3 ·
`#E4B478 → --color-bloom` ×3 · `#12161C → --semantic-bg` ×3.

### 7.6 What the checker reports for the 27 audited files (0 elsewhere)

| Bucket | Hits inside `components/mobile` + `components/ui` |
|---|---|
| `hexColor`, `rgbaColor`, `charIcon`, `iconSize`, `magicRadius` | **0** |
| `lucideImport` | 15 locations / 14 files: `BottomSheet.tsx:4` · `EmptyState.tsx:1` · `IconBadge.tsx:1` · `IconButton.tsx:3` · `LargeTitle.tsx:5` · `ListRow.tsx:5,6` · `Onboarding.tsx:5,10` · `Pills.tsx:1` · `PullToRefresh.tsx:10` · `StatBlock.tsx:5` · `Toast.tsx:4` · `ui/Modal.tsx:5` · `ui/Select.tsx:4`. Of these, 8 are **value** imports of glyphs later passed into `<Icon icon={…} />` (BottomSheet `X`, LargeTitle `ChevronLeft`, ListRow `ChevronRight`, Onboarding `Map/Images/Footprints/ChevronRight/X`, PullToRefresh `RefreshCw`, Toast `AlertCircle/CheckCircle2/Info/X`, Modal `X`, Select `ChevronDown`); 7 are `import type { LucideIcon }`. `components/mobile/Icon.tsx` is absent because of `ICON_SYSTEM_ALLOWLIST` |
| `fontSize` | 2: `PullToRefresh.tsx:88` (`text-[12px]`), `Switch.tsx:50` (`text-[12px]`) — 12 ∉ `{32,24,18,15,13,11}` |

---

## 8. Visual primitives vs content-agnostic

### 8.1 Visual primitives (a redesign changes these and the look changes everywhere)

| Component | Why it is a primitive | Import sites |
|---|---|---|
| `components/mobile/Icon.tsx` + `lib/mobile/icon-system.ts` | Sole gateway for glyph size (16/20/24), stroke (2/2/1.75), tone (9 values) and all semantic icon/tone maps (`ITINERARY_*`, `ACTIVITY_*`, `TRAVEL_TYPE_*`, `TRANSPORT_*`, `WEATHER_*`, `NAV_ICON`) | 86 |
| `components/mobile/IconButton.tsx` | 4 visual variants + the 44px hit-area contract | 1 |
| `components/mobile/Pressable.tsx` | The press-feedback primitive (`m-pressable`, scale 0.97) and the haptics switch | — (used indirectly; `.m-pressable` string appears in IconButton/LargeTitle/ListRow/StatBlock) |
| `components/mobile/Switch.tsx` | Track/knob geometry + on/off colors are all inline/Tailwind here | 1 |
| `components/mobile/SegmentedControl.tsx` | Pill track + sliding thumb + `--m-seg-count` contract | 1 |
| `components/mobile/Toast.tsx` (`ToastHost`) | Global notification surface; kind colors come from `m-toast[data-kind]` | 1 (mounted once) |
| `components/mobile/BottomSheet.tsx` | Sheet chrome: grabber, head, close, backdrop, drag-up animation | 4 |
| `components/mobile/ActionSheet.tsx` | iOS action-list idiom on top of BottomSheet | — (depends on BottomSheet) |
| `components/mobile/IconBadge.tsx` | Tone container (the designated place to add visual weight) | 2 |
| `components/mobile/Pills.tsx` | 4 label primitives, 2 sizes × 5 tones | 2 |
| `components/mobile/LargeTitle.tsx` | Page-header/chrome typography incl. the back affordance | 8 |
| `components/mobile/ListRow.tsx` (`ListSection` + `ListRow`) | Row/section layout: 64px rows, dividers, chevron, badge slot | 3 |
| `components/mobile/EmptyState.tsx` | Empty-state layout + 72px icon tile | 5 |
| `components/mobile/StatBlock.tsx` (`StatBlock` + `StatRow`) | Number/unit/label typography (`m-stat`, tabular-nums) | 2 |
| `components/mobile/Skeleton.tsx` (3 exports) | Loading placeholder shapes + shimmer | 7 |
| `components/ui/Button.tsx` | 4 variants × 2 sizes — but 0 import sites | 0 |
| `components/ui/Input.tsx` (`Input` + `Textarea`) | Field chrome, focus ring, label/hint/required — 0 import sites | 0 |
| `components/ui/Card.tsx` | Card surface — 0 import sites | 0 |
| `components/ui/Badge.tsx` | 3-tone pill — 0 import sites | 0 |
| `components/ui/SectionHeader.tsx` | Eyebrow/title/subtitle header + `tracking-[0.28em]` — 0 import sites | 0 |
| `components/ui/Modal.tsx` | Portal dialog surface, backdrop, panel, close button | 3 |
| `components/ui/Select.tsx` | Native select chrome + chevron | 1 |

### 8.2 Behavior-only / content-agnostic (no visual surface of their own)

| File | Nature |
|---|---|
| `components/mobile/CountUp.tsx` | Number animation only; renders a bare `<span>` with the caller's className. Owns reduced-motion logic |
| `components/mobile/Stagger.tsx` | Injects `--m-delay` + `m-list-item`; no own styling |
| `components/mobile/MobilePageTransition.tsx` | Toggles `m-page-fade` imperatively; wrapper is layout-only |
| `components/mobile/PullToRefresh.tsx` | Gesture wrapper; its only visual surface is `.m-ptr-indicator` (a `RefreshCw` + status text), and it deliberately bypasses the `Icon` component (`h-5 w-5`, `strokeWidth={2}`) |
| `components/mobile/Onboarding.tsx` | A **screen**, not a primitive: no props, three hardcoded Chinese slides (product copy), own localStorage key `tiantu-onboard-seen-v1`, own gating (`pathname === '/'`) |

### 8.3 Structural observations relevant to a redesign (facts only)

- Two independent color systems coexist (`--m-*` vs `--semantic-*`) and `ui/Modal` + `ui/Select` already
  import the mobile `Icon`, so the `ui/` layer is not fully isolated from `components/mobile/`.
- The only library file with a live `fontSize` violation is `PullToRefresh.tsx:88`; the other is
  `Switch.tsx:50`. The only library file that bypasses the `Icon` gateway is `PullToRefresh.tsx`.
- Every interactive element in the library except `Pressable` has an explicit hit-area declaration;
  measured sizes: 44px+ → `IconButton`, `LargeTitle` back, `BottomSheet` close, `ActionSheet`,
  `ListRow` (64px), `Switch` (52px), `Onboarding` skip/CTA (44/48px); below 44px →
  `SegmentedControl` (36px), `Toast` close (~16px icon, no padding), `StatBlock` link (content height),
  `ui/Button` md (~40px), `ui/Input`/`ui/Select` (~40px), `ui/Modal` close (~24px), `Pills` (24/28px,
  non-interactive labels), `ui/Badge` (~24px, non-interactive).
- Reduced-motion coverage is split: `CountUp` checks it in JS; `ui/Modal` uses `motion-safe:`;
  everything else relies on the single `@media (prefers-reduced-motion: reduce)` block at
  `app/mobile.css:606-613`, which enumerates `.m-*` selectors only. Not covered by that block:
  `Onboarding`'s `transition-all duration-300` dots, `transition-all` in `ui/Button`/`ui/Input`/
  `ui/Select`, `transition` in `ui/Modal`'s close button, `transition-opacity` in `Toast`'s close
  button, `active:scale` on `.m-seg-item` and `.m-chip`.
