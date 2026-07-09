const fs = require('fs');
let content = fs.readFileSync('data-store.js', 'utf8');

// Update createEmptyClient
content = content.replace(
  'seoAudit: { checked: {}, notes: {}, targetUrl: "" },',
  'seoAudit: { checked: {}, notes: {}, targetUrl: "" },\n      paidAdsAudit: { checked: {}, notes: {}, targetUrl: "", textInputs: { adSpend: "", roas: "", vulnerabilities: "", actions: "" } },'
);

// Update first client (techinnovators)
content = content.replace(
  'seoAudit: { checked: { \'s-1\': true, \'s-2\': true, \'s-5\': true }, notes: {}, targetUrl: "https://techinnovators.com" },',
  'seoAudit: { checked: { \'s-1\': true, \'s-2\': true, \'s-5\': true }, notes: {}, targetUrl: "https://techinnovators.com" },\n        paidAdsAudit: { checked: { \'pa-1\': true, \'pa-2\': true }, notes: {}, targetUrl: "https://techinnovators.com", textInputs: { adSpend: "$10,000", roas: "250%", vulnerabilities: "Wasted spend on broad match.", actions: "1. Switch to exact match.\\n2. Exclude past buyers." } },'
);

// Update second client (greenleaf)
content = content.replace(
  'seoAudit: { checked: {}, notes: {}, targetUrl: "https://greenleaf.org" },',
  'seoAudit: { checked: {}, notes: {}, targetUrl: "https://greenleaf.org" },\n        paidAdsAudit: { checked: {}, notes: {}, targetUrl: "", textInputs: { adSpend: "", roas: "", vulnerabilities: "", actions: "" } },'
);

fs.writeFileSync('data-store.js', content);
console.log('data-store.js updated successfully!');
