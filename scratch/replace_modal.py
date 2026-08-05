import re

with open('components/SharedModals.tsx', 'r') as f:
    content = f.read()

# State A
content = re.sub(
    r'<div className="fixed inset-0 z-\[1100\] flex items-center justify-center p-4 bg-black/60 animate-fade-in-down pointer-events-auto" style=\{\{ animationDuration: \'200ms\' \}\} onClick=\{\(\) => onSelect\(\'cancel\'\)\}>\n\s*<form\s*(.*?)className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-visible animate-fade-in-down relative z-\[1150\]"\s*style=\{\{ animationDuration: \'200ms\' \}\}\s*onClick=\{e => e\.stopPropagation\(\)\}\n\s*>',
    r'<ModalBackdrop onClick={() => onSelect(\'cancel\')} className="z-[1100]">\n        <ModalContainer className="overflow-visible relative z-[1150]">\n          <form \1className="flex flex-col w-full" onClick={e => e.stopPropagation()}>',
    content,
    flags=re.DOTALL
)

# Replace all headers and bodies inside DisambiguationModal states
# Header
content = re.sub(
    r'<header className="p-3 bg-zinc-900 border-b border-zinc-700 flex items-center justify-between">',
    r'<ModalHeader>',
    content
)
content = re.sub(r'</header>', r'</ModalHeader>', content)

# Body for State A (and others using p-5)
content = re.sub(
    r'<div className="p-5 flex flex-col gap-4 overflow-visible">',
    r'<ModalBody className="p-5 flex flex-col gap-4 overflow-visible">',
    content
)

# Body for State B (p-5 overflow-visible)
content = re.sub(
    r'<div className="p-5 overflow-visible">',
    r'<ModalBody className="p-5 overflow-visible">',
    content
)

content = re.sub(r'</ModalBody>\s*<ModalFooter>', r'</ModalBody>\n          <ModalFooter>', content)

with open('components/SharedModals.tsx', 'w') as f:
    f.write(content)
