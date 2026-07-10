import os

filepath = 'client-portal-manager/js/app.js'
with open(filepath, 'r') as f:
    js = f.read()

target = 'const baseUrl = window.location.origin + "/portal";'
new_target = 'const baseUrl = window.location.origin + "/portal/index.html";'

if target in js:
    js = js.replace(target, new_target)
    with open(filepath, 'w') as f:
        f.write(js)
    print("Patched client-portal-manager/js/app.js")

