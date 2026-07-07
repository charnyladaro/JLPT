// Extract PAGES + NAV from jlpt-docs.html into webapp/data/docs.json
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const html = readFileSync("E:/JLPT/jlpt-docs.html", "utf8");

// Collect every <script> block
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// Content blocks are the ones that assign into PAGES and don't touch the DOM
const contentBlocks = blocks.filter(b => b.includes("PAGES[") && !b.includes("document."));
// NAV lives in the app-logic block
const appBlock = blocks.find(b => b.includes("const NAV"));
const navSrc = appBlock.slice(appBlock.indexOf("const NAV"), appBlock.indexOf("const ORDER"));

const PAGES = {};
const evalScope = new Function("PAGES", contentBlocks.join("\n").replace(/^const PAGES = \{\};?/m, ""));
evalScope(PAGES);

const NAV = new Function(`${navSrc}; return NAV;`)();

mkdirSync("E:/JLPT/webapp/data", { recursive: true });
writeFileSync("E:/JLPT/webapp/data/docs.json",
  JSON.stringify({ nav: NAV, pages: PAGES }), "utf8");

console.log("pages:", Object.keys(PAGES).length, "nav groups:", NAV.length);
