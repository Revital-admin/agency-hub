# Competitor Analysis Template

A clean, interactive competitor analysis template for content production and brand strategy companies.

## Files

```
competitor-analysis/
├── index.html          ← Open this in your browser
├── css/
│   └── styles.css      ← All visual styles and layout
├── js/
│   ├── data.js         ← Edit rows, prompts, and SWOT content here
│   └── app.js          ← Builds the UI and handles interactions
└── README.md
```

## How to use

1. **Download** the folder
2. **Open** `index.html` in any browser — no server needed
3. **Fill in** your competitor data directly in the page
4. **Print** or save as PDF using the button at the bottom

## How to customize

### Change table rows
Edit the `TABLE_ROWS` array in `js/data.js`:
```js
const TABLE_ROWS = [
  { label: 'Followers', placeholder: 'e.g. 120K IG…' },
  // add or remove rows here
];
```

### Change SWOT prompts
Edit the `prompts` arrays inside `SWOT_DATA` in `js/data.js`.

### Change colors
All colors are CSS variables at the top of `css/styles.css`:
```css
:root {
  --purple-600: #534AB7;  /* primary accent */
  --color-bg:   #ffffff;  /* page background */
  /* etc. */
}
```

### Add your logo
In `index.html`, replace the `<header>` section with your logo image:
```html
<img src="your-logo.png" alt="Company name" height="36" />
```
