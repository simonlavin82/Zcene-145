import re

with open('functions/src/services/curatorService.ts', 'r') as f:
    text = f.read()

constraint = "\n\nNEGATIVE CONSTRAINT: NEVER use em-dashes (—) or long hyphens for dramatic effect or clause separation. Use standard editorial punctuation (commas, colons, or semicolons)."

# 1. systemInstruction inside generateRootsBreakdownBackend
# Find the end of systemInstruction string.
sys_inst_marker = "- For the artistSnippets field, generate an array of objects. Each object must have an 'id' (the canonical artist/label name) and a 'snippet' containing a dedicated, punchy, standalone 1-sentence \"epicenter hook\". This must be a complete sentence that summarizes their specific role in this exact ecosystem (e.g. \"Radiohead was the band staring at the static on the television screen.\"). Generate a hook for EVERY seed artist and EVERY satellite artist/label you mention."
text = text.replace(sys_inst_marker, sys_inst_marker + constraint)

# 2. GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
multi_marker = "Your entire response MUST be ONLY the raw JSON object, without any surrounding text or markdown code fences. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks."
text = text.replace(multi_marker, multi_marker + constraint)

# 3. GENERATE_GRAPH_PROMPT_TEMPLATE
graph_marker = "Do not invent connections to nodes you haven't defined. This is a architecture requirement."
text = text.replace(graph_marker, graph_marker + constraint)

# 4. GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE
context_marker = "IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., \"Artist \\\"Name\\\"\"). The final output must be perfectly valid JSON. Do not emit literal '\\n' strings; use standard JSON string encoding for line breaks. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences."
text = text.replace(context_marker, context_marker + constraint)

with open('functions/src/services/curatorService.ts', 'w') as f:
    f.write(text)

