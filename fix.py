import re
with open('components/GraphPage.tsx', 'r') as f:
    text = f.read()

# Remove disambiguationDialog from props
text = re.sub(r'\s*disambiguationDialog: \{.*?\};\n', '\n', text, flags=re.DOTALL)
text = re.sub(r'\s*onSelectDisambiguation: \(choice: string\) => void;\n', '\n', text)
text = re.sub(r'\s*disambiguationDialog, onSelectDisambiguation,', '', text)
text = re.sub(r'\s*<DisambiguationModal.*?/>', '', text, flags=re.DOTALL)

with open('components/GraphPage.tsx', 'w') as f:
    f.write(text)

with open('App.tsx', 'r') as f:
    text = f.read()
text = text.replace('onConfirm: (origins: Record<string, string>) => void;', 'onConfirm: () => void;')
with open('App.tsx', 'w') as f:
    f.write(text)
