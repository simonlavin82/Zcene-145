with open('App.tsx', 'r') as f:
    lines = f.read().split('\n')

stage_0_start = -1
stage_0_end = -1
try_start = -1
try_end = -1

for i, line in enumerate(lines):
    if "STAGE 0: UNIFIED DISAMBIGUATION GATE" in line:
        stage_0_start = i
    if "try {" in line and "const hasActiveFilters" in lines[i+1]:
        try_start = i
        stage_0_end = i - 1  # Actually, the empty line before it
    if "      } catch (err) {" in line and "console.warn(\"[Front Gate Cache] Read failed" in lines[i+1]:
        try_end = i + 3  # covers the `}` at 3382

print(f"stage_0_start: {stage_0_start}")
print(f"stage_0_end: {stage_0_end}")
print(f"try_start: {try_start}")
print(f"try_end: {try_end}")

if stage_0_start != -1 and try_start != -1 and try_end != -1:
    stage_0_block = lines[stage_0_start:stage_0_end]
    try_block = lines[try_start:try_end+1]
    
    new_lines = lines[:stage_0_start] + try_block + [''] + stage_0_block + lines[try_end+1:]
    
    with open('App.tsx', 'w') as f:
        f.write('\n'.join(new_lines))
    print("Moved block successfully!")
else:
    print("Failed to find boundaries.")
