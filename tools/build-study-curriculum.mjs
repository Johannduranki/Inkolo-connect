import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync(process.argv[2], 'utf8').replaceAll('\r\n', '\n');
const titles = ['Getting Started with Duranki', 'Financial Literacy and Business Records', 'Pricing, Costs and Profit', 'Stock Control and Bulk Buying', 'Customer Service and Marketing', 'Business Growth and Sustainability'];
const blocks = [...source.matchAll(/^MODULE (\d): .+\n([\s\S]*?)(?=^MODULE \d:|^ADMIN REPORTING|$(?![\s\S]))/gm)];
assert.equal(blocks.length, 6);
const modules = blocks.map((match, index) => {
  const body = match[2];
  const objective = body.match(/Learning objective:\n([\s\S]*?)\nLesson 1:/)[1].trim();
  const lessons = [...body.matchAll(/^Lesson \d: (.+)\n([\s\S]*?)(?=^Lesson \d:|^Practical activity:)/gm)].map(m => ({ title: m[1], content: m[2].trim() }));
  const activity = body.match(/Practical activity:\n([\s\S]*?)\nQuiz:/)[1].trim();
  const questions = [...body.matchAll(/^Q\d\. (.+)\nA\. (.+)\nB\. (.+)\nC\. (.+)\nCorrect answer: ([ABC])\.\nExplanation: (.+)/gm)].map(q => ({ prompt: q[1], options: q.slice(2, 5), correctIndex: 'ABC'.indexOf(q[5]), explanation: q[6] }));
  assert.equal(lessons.length, 3); assert.equal(questions.length, 5);
  return { title: titles[index], course: 'Trader Business Foundations', content: objective, lessons, activity, passPercentage: 80, resources: [], questions };
});
writeFileSync(new URL('../backend/src/study-foundations.json', import.meta.url), JSON.stringify(modules, null, 2) + '\n');
console.log('Generated six modules, 18 lessons and 30 explained questions from supplied material.');
