import os

filepath = 'app.js'
with open(filepath, 'r') as f:
    js = f.read()

target = """document.addEventListener("DOMContentLoaded", () => {
  try { initTabNavigation(); } catch(e) { console.error("TabNav Error:", e); }"""

new_target = """function fetchCloudflareProfile() {
  fetch('/api/user')
    .then(res => res.json())
    .then(data => {
      if (data && data.email && data.email !== 'Guest') {
        const userEmailEl = document.getElementById('userEmail');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userEmailEl) userEmailEl.textContent = data.email;
        if (userAvatarEl) {
          userAvatarEl.textContent = data.email.charAt(0).toUpperCase();
        }
      }
    })
    .catch(err => console.log('Running locally or no Cloudflare Access headers present.', err));
}

document.addEventListener("DOMContentLoaded", () => {
  fetchCloudflareProfile();
  try { initTabNavigation(); } catch(e) { console.error("TabNav Error:", e); }"""

if target in js:
    js = js.replace(target, new_target)
    with open(filepath, 'w') as f:
        f.write(js)
    print("Patched app.js with fetchCloudflareProfile")
else:
    print("Could not find target string")

