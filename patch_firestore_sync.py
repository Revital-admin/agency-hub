import os

filepath = 'app.js'
with open(filepath, 'r') as f:
    js = f.read()

target = """        // Prevent DOM tearing: only re-render if the write came from the cloud (teammate),
        // or if this is the very first load. If we wrote it, skip re-rendering to prevent 
        // interrupting the user's active inputs and checkbox states.
        if (!docSnap.metadata.hasPendingWrites) {
          populateClientDropdown();
          refreshAllViews();
          renderDashboard();
        }"""

new_target = """        // Prevent DOM tearing: check if the incoming data actually differs from our local state.
        // If it's exactly the same (because we just wrote it), skip re-rendering so we don't
        // interrupt the user's active inputs and checkbox states. If a teammate or incognito 
        // tab changed it, they will differ, triggering an instant UI refresh.
        const cloudStr = JSON.stringify(cloudData);
        const localStr = JSON.stringify(clientsDb);
        
        if (cloudStr !== localStr) {
          clientsDb = cloudData;
          localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
          populateClientDropdown();
          refreshAllViews();
          renderDashboard();
        }"""

if target in js:
    js = js.replace(target, new_target)
    with open(filepath, 'w') as f:
        f.write(js)
    print("Patched app.js with improved JSON.stringify sync logic")
else:
    print("Could not find target string")

