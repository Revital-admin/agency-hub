# UX/UI Audit Checklist

A clean, interactive 8-step UX/UI audit checklist you can run locally in any browser — no build tools, no dependencies, no server required.

This checklist features a design system styling-matched to the SEO Audit Checklist, updated with a custom purple color scheme suited for creative and UX audits, along with complete local persistence and PDF export functionality.

## Features

- **8-step workflow** based on standard heuristic analyses and UX evaluation tools (Figma, Hotjar, Lighthouse, Contrast Checker, WAVE, etc.)
- **40 sub-tasks** with exact descriptions of what to look for and how to resolve common design friction points
- **Progress saved automatically** in your browser (`localStorage`)
- **Animated score cards** with rotating metric labels tailored for user experience terminology
- **Filter by All / Incomplete / Complete**
- **Download PDF report** - Generates a professional PDF containing a progress score, audit date, target host, and categorized tables of passed and incomplete tasks, branded with the Revital Productions logo
- **Fully responsive** - Optimized for both desktop review and mobile inspections
- **High-contrast premium dark theme** with custom neon purple/indigo borders and shadows

## File Structure

```
ux-ui-audit-checklist/
├── index.html          ← Main HTML structure
├── css/
│   └── style.css       ← CSS variables, layout, typography, and theme
├── js/
│   ├── data.js         ← Checklist steps data, descriptions, tools, and rotating label strings
│   ├── logo.js         ← Base64 branding logo constant for offline PDF generation
│   └── app.js          ← State manager, local storage handlers, scorecard indicators, and jsPDF exporter
└── README.md
```

## How to Use

1. Navigate to the project directory or copy the files.
2. Open `index.html` in any modern browser by double-clicking the file.
3. Type the website or app URL in the **Target Website / App** field.
4. Click on any step card to expand it, view the expert tip, and check off sub-tasks.
5. Watch your progress update in real-time on the scorecards.
6. Click **Download PDF** to export a branded report of passed and incomplete items.

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
- `--color-accent` — main purple highlight colour (`#c084fc`)
- `--color-bg` — page background
- `--color-surface` — card backgrounds
- `--step-1` through `--step-8` — individual step badge colours

### Change fonts
The fonts are loaded from Google Fonts in `index.html`. Replace the `<link>` tag with any fonts you prefer, then update `--font-display`, `--font-body`, and `--font-mono` in `css/style.css`.

## Browser Support

Works in all modern browsers: Chrome, Firefox, Safari, Edge.
