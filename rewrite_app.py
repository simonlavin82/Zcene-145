import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# I will write a python script to replace the body of handleGenerateGraph.
# First I'll grab the exact boundaries of the function body.
