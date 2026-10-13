#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = app.indexOf('  function normalizeAnswer(value) {');
const end = app.indexOf('  function currentTask()', start);
assert(start >= 0 && end > start, 'Answer schema / expression checker must be present');
const block = app.slice(start, end);
const api = new Function(`${block}; return { compileMathExpression, expressionsEquivalent, answersMatchTask, isAutoGradableTask, answerHasContent, isLongTextTask };`)();
const evalExpr = api.compileMathExpression;
const visualApi = new Function(`const state = { graphViews: {} }; const $ = () => null; const CSS = { escape: (x) => x }; const escapeHtml = (x) => String(x ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); ${block}; return { renderGraphSvg, renderTaskVisuals };`)();
assert.equal(evalExpr('2^3 / 4')(0), 2, 'safe parser should evaluate arithmetic input');
assert.equal(evalExpr('-(x - 2)^2 + 5')(2), 5, 'safe parser should evaluate graph expressions');
assert.equal(api.expressionsEquivalent('2^3/4', '2'), true, 'equivalent numeric expressions should pass');
assert.equal(api.expressionsEquivalent('2^3/4', '3'), false, 'different numeric expressions should fail');
assert.equal(api.expressionsEquivalent('2*x+2', '2*(x+1)'), true, 'equivalent functions should pass sample-point comparison');
assert.throws(() => evalExpr('window.alert(1)'), 'arbitrary JavaScript must not be accepted');
const fieldsTask = { correctAnswer: '3124', answerSchema: { type: 'fields', fields: [
  { key: 'A', correctAnswer: '3' }, { key: 'B', correctAnswer: '1' }, { key: 'C', correctAnswer: '2' }, { key: 'D', correctAnswer: '4' }
] } };
assert.equal(api.answersMatchTask(fieldsTask, { A: '3', B: '1', C: '2', D: '4' }), true);
assert.equal(api.answersMatchTask(fieldsTask, { A: '3', B: '1', C: '4', D: '2' }), false);
const multiTask = { correctAnswer: '13', answerSchema: { type: 'multi-choice', correctAnswers: ['1','3'] } };
assert.equal(api.answersMatchTask(multiTask, ['3','1']), true, 'multi-select order should not affect checking');
assert.equal(api.answersMatchTask(multiTask, ['1','2','3']), false, 'extra choices must fail');
const longTask = { correctAnswer: null, answerSchema: { type: 'long-text', rubric: ['show steps'] } };
assert.equal(api.isLongTextTask(longTask), true);
assert.equal(api.isAutoGradableTask(longTask), false, 'long answers must not be auto-graded');
assert.equal(api.answersMatchTask(longTask, 'my reasoning'), null, 'long answers must be marked not-auto-graded');
assert.equal(api.answerHasContent({ A: '', B: '2' }), true);
assert.equal(api.answerHasContent({ A: '', B: '' }), false);
const data = JSON.parse(fs.readFileSync(path.join(root, 'tasks_data.json'), 'utf8'));
const graph = data.find(t => t.visual?.type === 'function-graph');
assert(graph, 'At least one interactive graph sample should exist');
assert.equal(evalExpr(graph.visual.functions[0].expression)(2), 5);
const svg = visualApi.renderGraphSvg(graph);
assert(svg.includes('<svg') && svg.includes('class=\"graph-curve\"'), 'Graph renderer should output an SVG curve');
assert(visualApi.renderTaskVisuals(graph).includes('data-graph-action=\"zoom-in\"'), 'Graph should expose interactive zoom controls');
const imageTasks = data.filter(t => t.media?.some(m => m.type === 'image' && m.zoomable));
assert(imageTasks.length >= 3, 'At least three sample tasks should have zoomable illustrations');
for (const task of imageTasks) for (const image of task.media.filter(m => m.type === 'image')) {
  assert(fs.existsSync(path.join(root, image.src.replace(/^\.\//, ''))), `Missing local task illustration ${image.src}`);
}
assert(data.some(t => t.subjectId === 'math_basic_extra' && t.answerSchema?.type === 'long-text'), 'A long-form self-check task should be available');
console.log('PASS: safe expression checker, structured/multi-select answers, manual long-answer marking, interactive graph, and zoomable task diagrams.');
