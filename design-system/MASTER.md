# Vodičák B — Design System (MASTER)

Source of truth for every screen. Page-specific deviations go to `design-system/pages/<page>.md`.
Derived from ui-ux-pro-max searches (style: *Flat Design Mobile (Touch-First)*, color: *Learning App*,
typography: *Plus Jakarta Sans*). The generator's default (Claymorphism + App-Store landing) was rejected:
it targets children and marketing pages, this is a daily-use study app for adult learners.

## Product

- Mobile-first study app for the Slovak driving licence theory exam (group B); web/PWA now, React Native/Expo later.
- Usage: short sessions on a phone, one hand, often on the go → large touch targets, one question per screen,
  primary action in thumb reach (bottom).

## Style — Flat Design Mobile (Touch-First)

- No decorative shadows; hierarchy from color blocking, spacing and type weight. One soft elevation only for
  floating layers (bottom sheet, tab bar on scroll).
- Solid icon containers (rounded squares, tinted) — one stroke icon set (2px, round caps), 24px.
- Press feedback: `scale(0.97)` within 100ms; no hover-only affordances.
- Ports 1:1 to React Native (`Pressable` scale, `borderRadius`, no web-only effects).

## Color tokens

| Token              | Light     | Dark      | Use                                  |
| ------------------ | --------- | --------- | ------------------------------------ |
| `--primary`        | `#4F46E5` | `#818CF8` | primary CTA, active tab, selection   |
| `--on-primary`     | `#FFFFFF` | `#0F1024` | text on primary                      |
| `--bg`             | `#F4F5FB` | `#0E1020` | app background                       |
| `--surface`        | `#FFFFFF` | `#181B30` | cards, sheets, rows                  |
| `--surface-2`      | `#EBEDF7` | `#22263F` | tracks, chips, pressed rows          |
| `--text`           | `#14163A` | `#ECEEFF` | primary text                         |
| `--text-2`         | `#5B6082` | `#A6ABCB` | secondary text (≥4.5:1 on surface)   |
| `--border`         | `#E1E4F2` | `#2C3150` | dividers, option outline             |
| `--success`        | `#15803D` | `#4ADE80` | correct, passed                      |
| `--danger`         | `#DC2626` | `#F87171` | wrong, failed, destructive           |
| `--warning`        | `#B45309` | `#FBBF24` | timer < 5 min, "almost there"        |

Correct/wrong is never color-only: always an icon (check / cross) and a text label.

## Typography — Plus Jakarta Sans (bundled, offline), 400–800

| Role        | Size/Line | Weight |
| ----------- | --------- | ------ |
| Large title | 30/36     | 800    |
| Title       | 20/28     | 700    |
| Question    | 19/27     | 700    |
| Body        | 16/24     | 500    |
| Label       | 13/18     | 600    |

Numbers (timer, scores) use `tabular-nums`.

## Layout

- Spacing scale 4/8/12/16/24/32. Screen gutter 16 (20 ≥ 390px). Max content width 600 on tablet/desktop.
- Radius: 10 (chips), 14 (rows/options), 20 (cards), 28 (sheets), 999 (pills).
- Touch targets ≥ 48px; ≥ 8px between targets.
- Respect `env(safe-area-inset-*)`; content padded above the tab bar and sticky action bar.

## Navigation

- Bottom tab bar, 4 tabs with icon + label: Domov, Testy, Okruhy, Štatistika.
- Tab screens: large title header. Pushed screens (section detail): compact header with back.
- Quiz/exam is full-screen (no tab bar): close (X) top-left, progress + timer top, action bar bottom.
- Confirmations and the exam question overview are bottom sheets (scrim 50%), never `window.confirm`.

## Motion

- 200ms ease-out enter, 140ms exit; screen content fades/slides 8px up; sheets slide from bottom.
- Answer feedback: result bar slides up from the bottom. Respect `prefers-reduced-motion`.
- Haptic tick (`navigator.vibrate(10)`) on answer, heavier pattern on wrong — native: expo-haptics.

## Anti-patterns

- Emoji icons, gradients/clay shadows, hover-only states, tables on mobile, horizontal scroll,
  color-only status, native browser dialogs, more than one primary button per screen.
