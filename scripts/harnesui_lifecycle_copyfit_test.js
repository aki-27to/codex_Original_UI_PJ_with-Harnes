const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const stylesCss = fs.readFileSync(path.join(root, "web", "01.HarnesUI", "styles.css"), "utf8");

function expectRegex(regex, message) {
  assert(regex.test(stylesCss), message);
}

expectRegex(
  /\.harness-workflow-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(112px,\s*1fr\)\)/,
  "workflow list should use a compact responsive grid"
);

expectRegex(
  /\.harness-workflow-step\s*\{[\s\S]*min-width:\s*0\b/,
  "workflow cards should allow shrinking without overflow"
);

expectRegex(
  /\.harness-workflow-step-label\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;[\s\S]*hyphens:\s*auto;/,
  "workflow labels should harden copy-fit with wrap and hyphenation rules"
);

expectRegex(
  /\.harness-workflow-detail\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/,
  "workflow detail text should also wrap instead of clipping"
);

expectRegex(
  /\.harness-lifecycle-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(156px,\s*1fr\)\)/,
  "internal lifecycle list should keep the responsive minmax grid"
);

expectRegex(
  /\.harness-lifecycle-step\s*\{[\s\S]*min-width:\s*0\b/,
  "lifecycle cards should allow shrinking without overflow"
);

expectRegex(
  /\.harness-lifecycle-step-label\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;[\s\S]*hyphens:\s*auto;/,
  "lifecycle labels should harden copy-fit with wrap and hyphenation rules"
);

expectRegex(
  /\.harness-lifecycle-detail\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/,
  "lifecycle detail text should also wrap instead of clipping"
);

console.log("PASS harnesui_lifecycle_copyfit_test");
