import os

filepath = 'app.js'
with open(filepath, 'r') as f:
    js = f.read()

target = """  // Calculate Onboarding completion %
  let totalOb = 0;
  let checkedOb = 0;
  client.onboardingChecklist.forEach(cat => {
    cat.items.forEach(item => {
      totalOb++;
      if (item.checked) checkedOb++;
    });
  });
  const obPct = totalOb > 0 ? Math.round((checkedOb / totalOb) * 100) : 0;"""

new_target = """  // Calculate Onboarding completion %
  let totalOb = 0;
  let checkedOb = 0;
  if (client.onboardingChecklist && Array.isArray(client.onboardingChecklist)) {
    client.onboardingChecklist.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          totalOb++;
          if (item.checked) checkedOb++;
        });
      }
    });
  }
  const obPct = totalOb > 0 ? Math.round((checkedOb / totalOb) * 100) : 0;"""

js = js.replace(target, new_target)

target2 = """  // Calculate SEO Audit Checklist progress
  let totalSeo = 0;
  let checkedSeo = 0;
  client.seoAudit.forEach(cat => {
    cat.items.forEach(item => {
      totalSeo++;
      if (item.checked) checkedSeo++;
    });
  });"""

new_target2 = """  // Calculate SEO Audit Checklist progress
  let totalSeo = 0;
  let checkedSeo = 0;
  if (client.seoAudit && Array.isArray(client.seoAudit)) {
    client.seoAudit.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          totalSeo++;
          if (item.checked) checkedSeo++;
        });
      }
    });
  }"""

js = js.replace(target2, new_target2)

with open(filepath, 'w') as f:
    f.write(js)
print("Patched renderDashboard")
