import os

filepath = 'client-portal-manager/js/app.js'
with open(filepath, 'r') as f:
    js = f.read()

# Replace the try/catch block
target1 = """let parentDb, parentSave, getActiveClient, activeClientName;
try {
  parentDb = window.parent.clientsDb;
  parentSave = window.parent.saveDatabase;
  getActiveClient = window.parent.getActiveClient;
  activeClientName = window.parent.activeClientName;
} catch (e) {
  console.log("CORS blocked parent access");
}"""

new_target1 = """let parentSave, getActiveClient;
try {
  parentSave = window.parent.saveDatabase;
  getActiveClient = window.parent.getActiveClient;
} catch (e) {
  console.log("CORS blocked parent access");
}"""

# Replace the init() check
target2 = """  if (!parentDb || !getActiveClient) {
    console.error("Hub database not accessible.");
    return;
  }"""

new_target2 = """  if (!getActiveClient) {
    console.error("Hub database not accessible.");
    return;
  }"""

# Replace the clientNameRaw extraction
target3 = """  const token = config.magicToken;
  const clientNameRaw = window.parent.activeClientName || "Client";
  magicLinkInput.value = `${baseUrl}?c=${encodeURIComponent(clientNameRaw)}&t=${token}`;"""

new_target3 = """  const token = config.magicToken;
  const clientNameRaw = client.id || client.name || "Client";
  magicLinkInput.value = `${baseUrl}?c=${encodeURIComponent(clientNameRaw)}&t=${token}`;"""

js = js.replace(target1, new_target1).replace(target2, new_target2).replace(target3, new_target3)

with open(filepath, 'w') as f:
    f.write(js)
print("Patched client-portal-manager/js/app.js to remove dependency on un-exported Hub globals")
