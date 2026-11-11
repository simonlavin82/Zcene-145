import re

with open('components/EnginePage.tsx', 'r') as f:
    content = f.read()

# 1. First, we need to extract all constants.
matches = re.finditer(r'const ([A_Z_]+_DOCUMENTATION) = `(.*?)`;\n', content, re.DOTALL)
constants = {}
for match in matches:
    name = match.group(1)
    value = match.group(2)
    constants[name] = value

print(f"Found {len(constants)} constants")

# 2. Modify PHYSICS_STABILIZATION_DOCUMENTATION value
physics = constants.get('PHYSICS_STABILIZATION_DOCUMENTATION')
if physics:
    old_text = """3. REVERSION BUG & AUTO-HYDRATION DEFANGING (App.tsx):
   - Problem: The Re-hydration Hook automatically reverted the selection to the Seed Artist if the selection became null.
   - Fix: The Re-hydration and Background Sync hooks are wrapped with a hasAutoSelectedRef so they only auto-select ONCE per project load. If the user intentionally clicks the background to clear the selection, the panel now gracefully closes without reverting to the seed."""
    new_text = """3. CLEAN SLATE MOUNTS & SELECTION REVERSION (App.tsx):
   - Problem: The legacy Re-hydration Hook automatically reverted the selection to the Seed Artist on load or if the selection became null.
   - Fix: The Re-hydration hooks have been completely stripped of auto-selection logic. Returning to a saved Zcene now guarantees a completely unfocused, centered, and unobstructed view. The panel gracefully remains closed until explicitly invoked."""
    
    if old_text in physics:
        physics = physics.replace(old_text, new_text)
        constants['PHYSICS_STABILIZATION_DOCUMENTATION'] = physics
        print("Updated PHYSICS_STABILIZATION_DOCUMENTATION")
    else:
        print("WARNING: Could not find old text in PHYSICS_STABILIZATION_DOCUMENTATION")
else:
    print("WARNING: PHYSICS_STABILIZATION_DOCUMENTATION not found")

# 3. Modify GRAPH_INTELLIGENCE_DOCUMENTATION (even if I replaced some of it before, let's just make sure)
# Actually, I already updated GRAPH_INTELLIGENCE_DOCUMENTATION in a previous step!
# Let's check if the new text is already there. If so, we don't need to replace it again.
graph_intel = constants.get('GRAPH_INTELLIGENCE_DOCUMENTATION')
if graph_intel:
    if "Clean Slate Mounts" in graph_intel:
        print("GRAPH_INTELLIGENCE_DOCUMENTATION is already updated")
    else:
        print("Wait, GRAPH_INTELLIGENCE_DOCUMENTATION is NOT updated? It should be.")

# 4. Remove all constants from the file
content = re.sub(r'const [A_Z_]+_DOCUMENTATION = `.*?`;\n', '', content, flags=re.DOTALL)

# 5. Inject into JSX
for name, value in constants.items():
    # Escape any backslashes or backticks if needed, but the original was in backticks, so it's fine.
    # We use a lambda to avoid backslash issues in replacement string
    content = re.sub(rf'content={{{name}}}', lambda m, v=value: f'content={{`{v}`}}', content)

# 6. Inject GRAPH_INTELLIGENCE_DOCUMENTATION because it's orphaned
graph_intel_inject = f'<CodeBlock title="Core Curation Engine" content={{`{constants["GRAPH_INTELLIGENCE_DOCUMENTATION"]}`}} />\n                        <DiscoveryFlowDiagram />'
content = content.replace('<DiscoveryFlowDiagram />', graph_intel_inject, 1)
print("Injected GRAPH_INTELLIGENCE_DOCUMENTATION")

with open('components/EnginePage.tsx', 'w') as f:
    f.write(content)

print("EnginePage.tsx updated successfully.")
