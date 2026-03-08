const fs = require("fs");
const path = require("path");

const root = __dirname;

const requiredFiles = ["index.html", "styles.css", "app.js"];
const requiredSections = ["services", "cases", "process", "careers", "contact"];
const requiredFormFields = ['name="name"', 'name="company"', 'name="email"', 'name="budget"', 'name="message"', 'name="privacy"'];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

requiredFiles.forEach((file) => {
  const target = path.join(root, file);
  assert(fs.existsSync(target), `Missing file: ${file}`);
});

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert(/<meta name="viewport" content="width=device-width, initial-scale=1\.0">/.test(html), "Viewport meta tag is missing.");
assert(/<link rel="stylesheet" href="styles\.css">/.test(html), "styles.css is not linked.");
assert(/<script src="app\.js" defer><\/script>/.test(html), "app.js is not linked.");

requiredSections.forEach((id) => {
  assert(new RegExp(`id="${id}"`).test(html), `Missing section id: ${id}`);
});

requiredFormFields.forEach((field) => {
  assert(html.includes(field), `Missing form field: ${field}`);
});

assert(css.includes(":root"), "CSS variables block (:root) is missing.");
assert(/@media\s*\(max-width:\s*860px\)/.test(css), "Mobile media query for 860px is missing.");
assert(css.includes("[data-reveal]"), "Reveal animation selector is missing.");

assert(js.includes("IntersectionObserver"), "IntersectionObserver logic is missing.");
assert(js.includes("contactForm"), "Form handling logic is missing.");
assert(js.includes("updateActiveNav"), "Active navigation update logic is missing.");
assert(js.includes("requestAnimationFrame"), "Counter animation logic is missing.");

console.log("PASS: Core files exist.");
console.log("PASS: HTML sections and links are valid.");
console.log("PASS: CSS responsive and animation hooks are present.");
console.log("PASS: JS interactivity features are present.");
console.log("PASS: Website validation completed.");
