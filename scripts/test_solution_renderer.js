#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  function escapeHtml(value) {');
const end = source.indexOf('  function normalizeAnswer(value) {', start);
assert(start >= 0 && end > start, 'Renderer functions must be present in app.js');
const rendererSource = source.slice(start, end);
const { renderMathExpression, renderMarkdown } = new Function(`${rendererSource}; return { renderMathExpression, renderMarkdown };`)();

const multiplication = renderMathExpression(String.raw`6\cdot12=72`);
assert(multiplication.includes('6 · 12=72'), `Multiplication dot should be readable: ${multiplication}`);
assert(!multiplication.includes('\\cdot'), 'LaTeX command \\cdot should not be shown literally');

const inequality = renderMathExpression(String.raw`x\neq y`);
assert(/x≠\s*y/.test(inequality), `\\neq should be rendered as ≠, not as a line break: ${inequality}`);

const escapedLineBreaks = renderMarkdown(String.raw`Вычисли \(6\cdot12=72\).\n\n**Ответ:** 72`);
assert(escapedLineBreaks.includes('6 · 12=72'), 'Inline math should be rendered inside Markdown');
assert(escapedLineBreaks.includes('<p><strong>Ответ:</strong> 72</p>'), `Legacy escaped paragraph break should split paragraphs: ${escapedLineBreaks}`);
assert(!escapedLineBreaks.includes('\\n'), `Literal escaped newline markers should not be visible: ${escapedLineBreaks}`);

const list = renderMarkdown('Шаги:\n- Первый шаг\n- Второй шаг');
assert(list.includes('<ul><li>Первый шаг</li><li>Второй шаг</li></ul>'), `Markdown lists should render as lists: ${list}`);

const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tasks_data.json'), 'utf8'));
let renderedFields = 0;
for (const task of tasks) {
  for (const field of ['statement', 'explanation']) {
    const rendered = renderMarkdown(task[field] || '');
    renderedFields += 1;
    assert(!rendered.includes('\\cdot'), `Literal \\cdot remains in ${task.externalId} (${field})`);
    assert(!rendered.includes('\\frac'), `Literal \\frac remains in ${task.externalId} (${field})`);
    assert(!rendered.includes('\\sqrt'), `Literal \\sqrt remains in ${task.externalId} (${field})`);
    assert(!rendered.includes('\\n\\n**Источник'), `Literal escaped paragraph marker remains in ${task.externalId} (${field})`);
  }
}
console.log(`PASS: multiplication dot, inequality symbols, legacy paragraph breaks, Markdown lists, and ${renderedFields} task text fields render without raw LaTeX commands.`);
