import os
import glob

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Common broken regex 1: replace(/
    # /g, '<br>')
    broken1 = "replace(/\n/g, '<br>')"
    fixed1 = r"replace(/\\n/g, '<br>')"
    
    # Common broken regex 2: replace(/
    # /g, '')
    broken2 = "replace(/\n/g, '')"
    fixed2 = r"replace(/\\n/g, '')"
    
    # Common broken regex 3: split('
    # ')
    broken3 = "split('\n')"
    fixed3 = r"split('\\n')"
    
    changed = False
    if broken1 in content:
        content = content.replace(broken1, fixed1)
        changed = True
    if broken2 in content:
        content = content.replace(broken2, fixed2)
        changed = True
    if broken3 in content:
        content = content.replace(broken3, fixed3)
        changed = True
        
    if changed:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed newlines in {filepath}")

for root, _, files in os.walk('.'):
    for f in files:
        if f.endswith('.js'):
            fix_file(os.path.join(root, f))

