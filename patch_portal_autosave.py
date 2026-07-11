import os

filepath = 'client-portal-manager/js/app.js'
with open(filepath, 'r') as f:
    js = f.read()

target = """  Object.keys(inputs).forEach(key => {
    if (inputs[key]) {
      inputs[key].value = config[key] || "";
    }
  });"""

new_target = """  Object.keys(inputs).forEach(key => {
    if (inputs[key]) {
      inputs[key].value = config[key] || "";
      inputs[key].addEventListener("input", (e) => {
        updateConfig(key, e.target.value);
      });
    }
  });"""

js = js.replace(target, new_target)

with open(filepath, 'w') as f:
    f.write(js)
print("Patched client portal autosave")
