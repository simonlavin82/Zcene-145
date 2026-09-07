import re
import sys

def migrate_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Import if not there
    if 'ModalBackdrop' not in content:
        content = content.replace("import React", "import React from 'react';\nimport { ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter } from './ui/Dialog';", 1)

    # 1. Replace the backdrop wrapper
    backdrop_pattern = re.compile(
        r'<div\s+className="fixed inset-0 [^"]*bg-black[^"]*"[^>]*onClick=\{([^}]+)\}\s*>',
        re.DOTALL
    )
    content = backdrop_pattern.sub(r'<ModalBackdrop onClick={\1}>', content)

    # Alternate backdrop where onClick is on a different line or not present
    backdrop_pattern2 = re.compile(
        r'<div\s+className="fixed inset-0 [^"]*bg-black[^"]*"[^>]*>',
        re.DOTALL
    )
    # Be careful not to replace things already replaced
    # Let's just do a safer approach, since there are only a few files.

    # 2. Replace the container
    container_pattern = re.compile(
        r'<div\s+className="bg-background-dark border border-zinc-600 rounded-none [^"]*"[^>]*onClick=\{e => e\.stopPropagation\(\)\}\s*>',
        re.DOTALL
    )
    content = container_pattern.sub(r'<ModalContainer>', content)

    # 3. Replace <header> to <ModalHeader>
    header_pattern = re.compile(
        r'<header\s+className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">',
        re.DOTALL
    )
    content = header_pattern.sub(r'<ModalHeader>', content)
    content = content.replace('</header>', '</ModalHeader>')

    # 4. Replace body
    body_pattern = re.compile(
        r'<div\s+className="flex-grow overflow-y-auto p-5 space-y-[^"]*">',
        re.DOTALL
    )
    content = body_pattern.sub(r'<ModalBody className="flex-grow p-5 space-y-5">', content)

    # The end of body might be tricky. The div ends right before ModalFooter.
    # It's better to manually fix the ones that need it or let ModalContainer handle most of the work.

    # Let's just replace closing tags for backdrop and container
    # Since we changed `<div` to `<ModalBackdrop>` and `<ModalContainer>`, we have a tag mismatch if we don't replace `</div>`.
    # This is why regex is dangerous for HTML.
    
    with open(filepath, 'w') as f:
        f.write(content)

# Actually, maybe I shouldn't use regex for HTML parsing.
