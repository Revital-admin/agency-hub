document.addEventListener('DOMContentLoaded', () => {
  const inputs = document.querySelectorAll('input, select, textarea');
  const previewContainer = document.getElementById('previewContainer');
  const copyBtn = document.getElementById('copyBtn');
  let currentMarkdown = '';

  function generateMarkdown() {
    const campaignName = document.getElementById('campaignName').value || '[Campaign Name]';
    const clientName = document.getElementById('clientName').value || '[Client Name]';
    const objective = document.getElementById('objective').value;
    const targetAudience = document.getElementById('targetAudience').value || '[Target Audience]';
    const keyMessage = document.getElementById('keyMessage').value || '[Key Message]';
    const toneOfVoice = document.getElementById('toneOfVoice').value;
    const deliverables = document.getElementById('deliverables').value || '[Deliverables list]';
    const references = document.getElementById('references').value || '[No references provided]';

    const md = `# 🎬 Creative Brief: ${campaignName}

**Client:** ${clientName}
**Primary Objective:** ${objective}

## 🎯 Target Audience
> ${targetAudience}

## 💡 Key Message / Value Proposition
${keyMessage}

## 🗣️ Tone of Voice
**${toneOfVoice}**

## 📦 Required Deliverables
${deliverables}

## 🔗 Inspiration & References
${references}

---
*Generated via Revital Hub - Creative Brief Generator*
`;

    // Save raw markdown for copying
    currentMarkdown = md;
    
    // Render HTML preview using marked.js
    previewContainer.innerHTML = marked.parse(md);
  }

  // Update preview on any input change
  inputs.forEach(input => {
    input.addEventListener('input', generateMarkdown);
  });

  // Initial generation
  generateMarkdown();

  // Copy functionality
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentMarkdown).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      copyBtn.style.background = '#10b981'; // green
      
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.style.background = '';
      }, 2000);
    });
  });
});