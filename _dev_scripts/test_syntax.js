const fs = require('fs');

try {
  const data = fs.readFileSync('sop-wiki/js/data.js', 'utf8');
  eval(data);
  const app = fs.readFileSync('sop-wiki/js/app.js', 'utf8');
  eval(app);
  console.log("Syntax is OK");
} catch(e) {
  console.error(e);
}
