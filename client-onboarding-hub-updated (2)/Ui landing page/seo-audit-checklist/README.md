# SEO Audit Checklist

A clean, interactive 8-step SEO audit checklist you can run locally in any browser — no build tools, no dependencies, no server required.

## Features

- 8-step workflow based on real tools (Screaming Frog, GSC, TinyPNG, ChatGPT, etc.)
- 42 sub-tasks with descriptions of exactly what to do
- Progress saved automatically in your browser (localStorage)
- Animated score cards with rotating metric labels
- Filter by All / Incomplete / Complete
- Fully responsive — works on mobile and desktop
- Dark theme with a clean typographic design

## File Structure

```
seo-audit-checklist/
├── index.html          ← Main page
├── css/
│   └── style.css       ← All styles, CSS variables, layout
├── js/
│   ├── data.js         ← Step data, sub-tasks, tool tags, metric label sets
│   └── app.js          ← State management, rendering, events, animations
└── README.md
```

## How to Use

1. Download or clone this folder
2. Open `index.html` in any modern browser — double-click it
3. Click any step to expand it and check off tasks
4. Progress is automatically saved in your browser

No internet connection required after the initial font load (Google Fonts).

## Customisation

### Edit steps and tasks
Open `js/data.js` and edit the `STEPS` array. Each step has:
- `title` — shown in the header
- `tools` — displayed as tags
- `tip` — shown inside the expanded step
- `subs` — array of `{ id, label, desc }` sub-tasks

### Change metric label names
In `js/data.js`, edit the `METRIC_LABELS` object. Each key (`steps`, `tasks`, `remaining`, `score`) holds an array of label strings that cycle automatically. Add as many variants as you like.

### Change colours
Open `css/style.css` and edit the `:root` CSS variables at the top of the file:
- `--color-accent` — main green highlight colour
- `--color-bg` — page background
- `--color-surface` — card backgrounds
- `--step-1` through `--step-8` — individual step badge colours

### Change fonts
The fonts are loaded from Google Fonts in `index.html`. Replace the `<link>` tag with any fonts you prefer, then update `--font-display`, `--font-body`, and `--font-mono` in `css/style.css`.

## Browser Support

Works in all modern browsers: Chrome, Firefox, Safari, Edge.
