The issue lies in `components/MusicGraph.tsx` within the `extractFuzzyPrefix` function (around line 54) and how it's used to render the `narrativeSnippet` (DNA) around line 1630.

### Exact Cause of Failure
The `extractFuzzyPrefix` function is overly restrictive in two ways:
1. **Strict Prefix Requirement:** It only matches if the artist name is at the *exact beginning* of the string. In the case of "Cherry Poppin' Daddies", the narrative snippet starts with `"The Cherry Poppin' Daddies"`. Because the string starts with `"T"` instead of `"C"`, `targetNorm.startsWith(currentNorm)` fails immediately and returns `null`. 
2. **Brittle Iteration:** While it attempts to strip non-alphanumeric characters, the strict sequential character-by-character loop makes it prone to breaking if there are any unexpected character mismatches.

### Implementation Plan
To fix this and address the special characters hypothesis, we need to replace the prefix-only fuzzy logic with a robust, globally-applicable substring search that safely escapes regex characters.

1. **Create a safe regex escaping function:** 
   We will escape the `hoveredLink.sourceId` (the artist name) to prevent any special characters (like `+`, `?`, or apostrophes) from breaking the regular expression.
   ```javascript
   const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   ```
2. **Replace `extractFuzzyPrefix` in the render block:**
   Instead of just checking the prefix, we will use a case-insensitive regex split to find the artist name anywhere in the `cleanedDna` string.
   ```javascript
   const target = hoveredLink.sourceId || '';
   const regex = new RegExp(`(${escapeRegExp(target)})`, 'gi');
   const parts = cleanedDna.split(regex);
   ```
3. **Map and Highlight the Parts:**
   We will render the array of string parts, wrapping the matched part in the `<span className="text-primary font-normal">` tag. This automatically preserves the exact original casing and punctuation from the narrative snippet.
