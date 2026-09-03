const fs = require('fs');
const path = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/functions/src/services/curatorService.ts';
let code = fs.readFileSync(path, 'utf8');

// We want to add TokenUsage definition and UsageCollector interface
const interfaceCode = `
export interface TokenUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}
export interface UsageCollector {
  push: (model: string, usage: TokenUsage) => void;
}
`;

// Insert the interface near the top
code = code.replace(/import \{ GraphData, Node, Link, DiscoveryFilters \} from "\.\.\/types";/, "$&\n" + interfaceCode);

fs.writeFileSync(path, code);
console.log("Interface injected.");
