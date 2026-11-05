// Print rows as they arrive, with column widths fixed up front.
// Run with: node examples/stream.js
import { createStream } from '../src/index.js';

const stream = createStream({
  border: 'ascii',
  columns: [
    { key: 'step', title: '#', width: 3, align: 'right' },
    { key: 'task', title: 'Task', width: 22 },
    { key: 'ms', title: 'Time (ms)', width: 9, align: 'right' },
  ],
});

const tasks = ['resolve dependencies', 'compile sources and generate type declarations', 'run tests', 'package'];
let step = 0;
for (const task of tasks) {
  step += 1;
  stream.write({ step, task, ms: task.length * 37 });
}
stream.end();
