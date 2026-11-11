import re
with open('components/DetailsPanel.tsx', 'r') as f:
    lines = f.readlines()
    
depth = 0
for i, line in enumerate(lines):
    # simple heuristic for opening and closing divs
    opens = len(re.findall(r'<div', line))
    closes = len(re.findall(r'</div', line))
    depth += opens - closes
    if 'id="magazine-scroll-container"' in line:
        print(f"magazine-scroll-container opens at line {i+1}, depth {depth}")
    if 'onClick={scrollToTop}' in line:
        print(f"scrollToTop at line {i+1}, depth {depth}")
