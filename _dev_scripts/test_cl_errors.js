const fs = require('fs');

// We'll run a quick eval of the JS to see if there are syntax errors
const dataStr = fs.readFileSync('campaign-launch-checklist/js/data.js', 'utf8');
const appStr = fs.readFileSync('campaign-launch-checklist/js/app.js', 'utf8');

try {
  eval(dataStr);
  eval(appStr);
  console.log("No syntax errors found");
} catch(e) {
  console.error("Error:", e);
}
