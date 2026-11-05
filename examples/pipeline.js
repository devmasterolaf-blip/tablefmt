// Read CSV text, filter and sort the records, and print the result in
// three formats. Run with: node examples/pipeline.js
import { filterRecords, fromRecordSet, readRecords, render, selectColumns, sortRecords } from '../src/index.js';

const csv = `city,country,population,area
Oslo,NO,709000,454
Bergen,NO,289000,465
Rome,IT,2760000,1285
Milan,IT,1370000,182
Nice,FR,342000,72
`;

let set = readRecords(csv, 'csv');
set = { keys: set.keys, records: filterRecords(set.records, ['population >= 300000'], set.keys) };
set = { keys: set.keys, records: sortRecords(set.records, 'country,-population', set.keys) };
set = selectColumns(set, ['country', 'city', 'population']);

const table = fromRecordSet(set);
for (const format of ['text', 'markdown', 'csv']) {
  console.log(`# ${format}`);
  console.log(render(table, format));
  console.log();
}
