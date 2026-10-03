import os
import re

components_dir = 'components'
modified_files = []
total_replacements = 0

input_pattern = re.compile(r'(<input\b[^>]*>)', re.IGNORECASE)

def process_file(filepath):
    global total_replacements
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements_in_file = 0

    def replace_input(match):
        nonlocal replacements_in_file
        tag = match.group(1)
        
        type_match = re.search(r'type\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
        input_type = type_match.group(1).lower() if type_match else 'text'
        
        if input_type not in ['text', 'search']:
            return tag
            
        if 'data-1p-ignore' in tag:
            return tag
            
        # First remove any existing autoComplete
        new_tag = re.sub(r'\s+autoComplete\s*=\s*["\'][^"\']*["\']', '', tag, flags=re.IGNORECASE)
        
        # Replace <input or <Input with <input/Input autoComplete...
        # Using a regex to preserve case of Input/input
        new_tag = re.sub(r'^(<input)', r'\1 autoComplete="off" data-1p-ignore="true" data-lpignore="true"', new_tag, flags=re.IGNORECASE)
        
        replacements_in_file += 1
        return new_tag

    new_content = input_pattern.sub(replace_input, content)
    
    if replacements_in_file > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        modified_files.append((filepath, replacements_in_file))
        total_replacements += replacements_in_file

for root, _, files in os.walk(components_dir):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.jsx'):
            process_file(os.path.join(root, file))

print(f"Total replacements: {total_replacements}")
for file, count in modified_files:
    print(f"Modified {file}: {count} inputs")
