import re

with open('components/SharedModals.tsx', 'r') as f:
    content = f.read()

# Add imports
import_stmt = "import { ModalFooter, ModalContainer, ModalBackdrop, ModalHeader, ModalBody } from './ui/Dialog';\n"
if "import { ModalFooter" not in content:
    content = content.replace("import React", import_stmt + "import React")

# Replace TokenConfirmationDialog
# Lines 261-270
content = content.replace(
'''    <div 
      className="fixed inset-0 bg-black/60 z-[130] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto" 
      style={{ animationDuration: '200ms' }}
      onClick={onClose}
    >
      <div 
        className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fade-in-down" 
        style={{ animationDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >''',
'''    <ModalBackdrop onClick={onClose} className="z-[130]">
      <ModalContainer>'''
)
content = content.replace(
'''        <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">''',
'''        <ModalHeader>'''
)
content = content.replace(
'''          </button>
        </header>''',
'''          </button>
        </ModalHeader>'''
)

# TokenConfirmationDialog closing
content = content.replace(
'''        </footer>
      </div>
    </div>''',
'''        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>'''
)

# Replace all standard footers
content = re.sub(r'<footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">', '<ModalFooter>', content)
content = re.sub(r'<footer className="p-3 sm:p-4 bg-zinc-900 border-t border-zinc-700 flex flex-wrap items-center justify-end gap-3">', '<ModalFooter className="sm:p-4 flex-wrap items-center gap-3">', content)
content = re.sub(r'<footer className="p-4 bg-zinc-900 border-t border-zinc-700 flex justify-end">', '<ModalFooter className="p-4 gap-0">', content)
content = re.sub(r'<footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end">', '<ModalFooter className="gap-0">', content)
content = re.sub(r'<footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-3">', '<ModalFooter className="gap-3">', content)
content = re.sub(r'</footer>', '</ModalFooter>', content)

with open('components/SharedModals.tsx', 'w') as f:
    f.write(content)
