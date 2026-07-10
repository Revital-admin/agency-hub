import os

filepath = 'app.js'
with open(filepath, 'r') as f:
    js = f.read()

# I will append window exports at the end of loadDatabase and whenever activeClientName changes, but actually I can just do it globally by modifying the getActiveClient function to also expose the name, OR I can just export them right after they are modified.
# Alternatively, I can just change client-portal-manager/js/app.js to use getActiveClient().name!
