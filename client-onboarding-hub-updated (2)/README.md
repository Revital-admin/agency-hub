# Client Onboarding & Audit Hub

A premium, glassmorphic client onboarding and audit management console built for agencies and digital marketing teams. This portal consolidates key onboarding workflows, SWOT competitor analysis, checklist audits, social strategy guides, and monthly client reporting into a unified interface.

---

## 🌟 Key Features

1. **Overview Dashboard**: Track audit progress (UX/UI, SEO, Social, and Content Strategy) dynamically across all client profiles.
2. **Client Workspace Manager**: Easily switch between client profiles, add new clients, or export the entire LocalStorage database.
3. **Quick Sandbox (One-Offs)**: A pinned workspace that allows running one-off audits without cluttering client list. Features a global warning banner and a master reset button to clear checklist states instantly.
4. **UX/UI Heuristic Audit**: A structured grading system covering usability heuristics, layout, typography, and site performance.
5. **SEO Audit Checklist**: Step-by-step workflow covering indexing, technical SEO, mobile friendliness, metadata, and core web vitals.
6. **Social & Digital Strategy Guide**: Tactical digital marketing pillars covering audience pain points, topic clustering, and KPIs.
7. **Social Media Audit**: 8-step auditing tool with 40 granular sub-tasks for optimizing brand presence.
8. **Competitor Lists (Web & Social)**: Comparison grids with built-in interactive SWOT prompts that copy directly into notes.
9. **Monthly Report Designer**: real-time preview document generator with custom platform metrics (Engagement, Reach, Impressions) that formats into a clean, borderless layout for PDF printing.

---

## 🛠 Architecture & Tech Stack

- **Core Technologies**: HTML5, CSS3 (Vanilla glassmorphic design), ES6 JavaScript.
- **Embedded Checklists**: Standalone sub-tools nested inside parent `iframe` wrappers.
- **Bidirectional Sync**: Checklist states and text fields bind directly to parent `localStorage` data objects. Switching clients or updating checkmarks triggers real-time parent state saving and dashboard metric re-calculations.
- **Print Engine**: Fully integrated `@media print` directives in the stylesheets that automatically hide navigation sidebars, buttons, and input boundaries for clean PDF exports.

---

## 🚀 How to Run Locally

Since this portal utilizes `iframe` elements sharing a parent origin, browsers require files to be served via a local web server (instead of double-clicking `index.html` from the file system).

### Option 1: Using Python (Simplest)
Open terminal in the project directory and run:
```bash
python3 -m http.server 8000
```
Then open your web browser and navigate to:
**[http://localhost:8000](http://localhost:8000)**

### Option 2: Using Node.js
If you have Node.js installed, you can use `serve` or any similar HTTP server:
```bash
npx serve
```
Then navigate to the port displayed in the console.

---

## 📦 How to Upload to GitHub

Follow these steps to initialize a Git repository and push the project to your GitHub account:

1. **Create a GitHub Repository**:
   - Go to [GitHub](https://github.com) and click **New Repository**.
   - Name your repository (e.g., `client-onboarding-hub`).
   - Do **not** add a README, `.gitignore`, or license (as we will create them locally).

2. **Initialize Local Git Repository**:
   Open terminal in your project directory `/Users/ronald/Downloads/Ui landing page` and run:
   ```bash
   git init
   ```

3. **Add and Commit Files**:
   ```bash
   git add .
   git commit -m "Initial commit: Client Onboarding and Audit Hub with new modules"
   ```

4. **Link Local Repository to GitHub & Push**:
   Replace `your-username` with your GitHub username:
   ```bash
   git branch -M main
   git remote add origin https://github.com/your-username/client-onboarding-hub.git
   git push -u origin main
   ```

---

## 🌐 Publish Online with GitHub Pages

You can host this hub for free directly on GitHub Pages:

1. Go to your repository on GitHub.
2. Click **Settings** (gear icon at the top).
3. Under the left menu, click **Pages**.
4. Under **Build and deployment**, set the branch Source to `main` and folder to `/ (root)`.
5. Click **Save**.
6. After a few minutes, your site will be live at: `https://your-username.github.io/client-onboarding-hub/`
