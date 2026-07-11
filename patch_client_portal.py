import os

filepath = 'client-portal-manager/index.html'
with open(filepath, 'r') as f:
    html = f.read()

target = """      <div class="form-group">
        <label for="primaryColor">Client Brand Primary Color</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="color" id="primaryColor" value="#10b981" style="width: 50px; height: 40px; padding: 0; border: none; border-radius: 8px; cursor: pointer; background: transparent;">
          <span id="colorHex" style="font-family: var(--font-mono); color: var(--color-text-secondary);">#10b981</span>
        </div>
      </div>"""

new_target = """      <div class="form-group">
        <label for="primaryColor">Client Brand Primary Color</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="color" id="primaryColor" value="#10b981" style="width: 50px; height: 40px; padding: 0; border: none; border-radius: 8px; cursor: pointer; background: transparent;">
          <span id="colorHex" style="font-family: var(--font-mono); color: var(--color-text-secondary);">#10b981</span>
        </div>
      </div>

      <div class="form-group">
        <label for="secondaryColor">Client Brand Secondary Color</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="color" id="secondaryColor" value="#6366f1" style="width: 50px; height: 40px; padding: 0; border: none; border-radius: 8px; cursor: pointer; background: transparent;">
          <span id="colorHexSecondary" style="font-family: var(--font-mono); color: var(--color-text-secondary);">#6366f1</span>
        </div>
      </div>"""

if target in html:
    html = html.replace(target, new_target)
    with open(filepath, 'w') as f:
        f.write(html)
    print("Patched client-portal-manager/index.html")
else:
    print("Target not found!")
