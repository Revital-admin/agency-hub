/* ============================================================
   copywriting-assistant/js/templates.js
   Copywriting Framework Blueprints and Generation Formulas
   ============================================================ */

const COPY_TEMPLATES = {
  aida: {
    name: "AIDA Framework (Attention, Interest, Desire, Action)",
    description: "The classic marketing formula to guide a reader from initial awareness to taking action.",
    generate: (product, audience, benefit, cta) => {
      const p = product || "[Product/Service]";
      const aud = audience || "[Target Audience]";
      const ben = benefit || "[Main Benefit / Solution]";
      const action = cta || "[Call to Action]";
      
      return `📢 ATTENTION:
Attention all ${aud}! Are you still struggling to find a reliable way to get ${ben}? Meet ${p} — built to change the game for you.

✨ INTEREST:
Unlike traditional options, ${p} cuts out the clutter. We focus on speed, style, and simplicity so you can get up and running in minutes, not days.

🔥 DESIRE:
Imagine having total control over your results without the usual stress. With our custom approach, you can unlock greater efficiency, save hours of manual work, and focus on growing your business.

🚀 ACTION:
Ready to make the shift? Click below to ${action} and experience the difference today!`;
    }
  },
  pas: {
    name: "PAS Framework (Problem, Agitate, Solve)",
    description: "Focuses on the customer's pain point, amplifies the cost of inaction, and presents your offer as the cure.",
    generate: (product, audience, benefit, cta) => {
      const p = product || "[Product/Service]";
      const aud = audience || "[Target Audience]";
      const ben = benefit || "[Main Benefit / Solution]";
      const action = cta || "[Call to Action]";
      
      return `❌ PROBLEM:
If you are a ${aud}, you know how frustrating it is when you can't get ${ben}. It wastes your time, drains your budget, and slows down your momentum.

⚠️ AGITATE:
And the truth is, ignoring it only makes it worse. Every day you delay is another day of lost conversions, unnecessary bottlenecks, and competitive disadvantage.

✅ SOLVE:
Fortunately, there is a better way. ${p} solves this pain point permanently by giving you the exact tools you need to succeed. Stop settling for less — click here to ${action} now!`;
    }
  },
  bab: {
    name: "BAB Framework (Before, After, Bridge)",
    description: "Paints a picture of the current struggle, visualizes a perfect future state, and builds a bridge to get there.",
    generate: (product, audience, benefit, cta) => {
      const p = product || "[Product/Service]";
      const aud = audience || "[Target Audience]";
      const ben = benefit || "[Main Benefit / Solution]";
      const action = cta || "[Call to Action]";
      
      return `⏮️ BEFORE:
Right now, you are spending hours trying to get ${ben}. It's tedious, complicated, and keeps you from focusing on your core strengths.

⏭️ AFTER:
But imagine this: A streamlined, automated process that works in the background, delivering consistency, high quality, and peace of mind on autopilot.

🌉 BRIDGE:
Here is how you bridge that gap: ${p}. We handle the heavy lifting so you don't have to. Take the first step and click here to ${action} today!`;
    }
  }
};
