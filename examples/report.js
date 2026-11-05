// A quarterly report with row groups, a spanning cell, decimal alignment,
// a nested table and a footer. Run with: node examples/report.js
import { Table, renderText } from '../src/index.js';

const contacts = new Table({ border: 'none', header: false }).rows([
  ['sales', 'ana@example.com'],
  ['support', 'li@example.com'],
]);

const table = new Table({
  border: 'rounded',
  columns: [
    { key: 'region', title: 'Region' },
    { key: 'revenue', title: 'Revenue', align: 'decimal' },
    { key: 'change', title: 'Change', align: 'right', format: (value) => `${value > 0 ? '+' : ''}${value}%` },
    { key: 'notes', title: 'Notes', maxWidth: 28 },
  ],
});

table
  .group('Europe')
  .row({ region: 'North', revenue: '1204.5', change: 12, notes: 'Two new distributors signed in the last month of the quarter.' })
  .row({ region: 'South', revenue: '987.25', change: -3, notes: contacts })
  .group('Asia')
  .row(['East', '15020', 40, { content: 'Launch quarter', style: { bold: true } }])
  .row(['West', { content: 'not yet reported', colSpan: 2, align: 'center' }, ''])
  .footer(['Total', '17211.75', '', '']);

console.log(renderText(table));
