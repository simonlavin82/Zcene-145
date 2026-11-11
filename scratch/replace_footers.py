import re

with open('components/SharedModals.tsx', 'r') as f:
    content = f.read()

# Add import
import_stmt = "import { ModalFooter, ModalContainer, ModalBackdrop, ModalHeader, ModalBody } from './ui/Dialog';\n"
if "import { ModalFooter" not in content:
    content = content.replace("import React", import_stmt + "import React")

# Replace all footers
content = re.sub(r'<footer className="[^"]*">', '<ModalFooter>', content)
content = content.replace('</footer>', '</ModalFooter>')

with open('components/SharedModals.tsx', 'w') as f:
    f.write(content)
