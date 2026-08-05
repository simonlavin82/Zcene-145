import re
import glob

def extract_buttons(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Find all <button ...> ... </button>
    buttons = re.findall(r'<button\b[^>]*>(.*?)</button>', content, flags=re.DOTALL)
    
    print(f"--- {filename} ---")
    for btn in buttons:
        # extract text and span icons
        icon_match = re.search(r'<span[^>]*material-symbols-outlined[^>]*>([^<]+)</span>', btn)
        icon = icon_match.group(1) if icon_match else None
        
        # remove all tags to get pure text
        text = re.sub(r'<[^>]+>', '', btn).strip()
        # cleanup newlines
        text = re.sub(r'\s+', ' ', text)
        
        if text or icon:
            print(f"Icon: {icon} | Text: '{text}'")

for f in ['components/SharedModals.tsx', 'components/DesignSystem.tsx', 'components/ui/Dialog.tsx']:
    extract_buttons(f)
