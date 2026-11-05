/**
 * Width allocation: fit a set of columns into the available width.
 * @module layout
 */

import { LayoutError } from './errors.js';

/**
 * @typedef {object} ColumnMetric
 * @property {number} preferred width the column takes when there is room
 * @property {number} floor smallest width the column may be given
 * @property {number} ceiling largest width the column may grow to
 * @property {number} flex weight when sharing spare or missing width; 0 pins the column
 */

/**
 * Split an integer `total` into integer shares proportional to `weights`,
 * using the largest-remainder method so that the shares always add up to
 * `total`. Ties go to the earlier entry. When every weight is zero, every
 * share is zero.
 * @param {number} total non-negative integer
 * @param {readonly number[]} weights non-negative numbers
 * @returns {number[]}
 */
export function distribute(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const shares = exact.map(Math.floor);
  let remaining = total - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .filter((entry) => weights[entry.index] > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; remaining > 0; i = (i + 1) % order.length, remaining--) {
    shares[order[i].index]++;
  }
  return shares;
}

/**
 * Choose a width for every column.
 *
 * Columns start at their preferred width. If that is too wide for
 * `available`, the excess is taken from the flexible columns in proportion
 * to how far each is above its floor (times its flex weight), so wide
 * columns give up more than narrow ones. If there is room to spare and
 * `expand` is set, the spare width goes to the flexible columns in
 * proportion to their flex weight, up to each column's ceiling.
 * @param {readonly ColumnMetric[]} metrics
 * @param {number} [available] total width for all columns; unlimited when omitted
 * @param {{expand?: boolean}} [options]
 * @returns {number[]} one width per column
 * @throws {LayoutError} when the columns cannot shrink enough
 */
export function allocateWidths(metrics, available, { expand = false } = {}) {
  const widths = metrics.map((metric) => metric.preferred);
  if (available === undefined) return widths;
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > available) {
    let excess = total - available;
    while (excess > 0) {
      const slack = metrics.map((metric, i) => (metric.flex > 0 ? Math.max(0, widths[i] - metric.floor) : 0));
      if (slack.every((value) => value === 0)) {
        throw new LayoutError(
          `Columns need at least ${widths.reduce((a, b) => a + b, 0)} columns of width but only ${available} are available`,
        );
      }
      const cuts = distribute(excess, slack.map((value, i) => value * metrics[i].flex));
      for (let i = 0; i < widths.length; i++) {
        const cut = Math.min(cuts[i], slack[i]);
        widths[i] -= cut;
        excess -= cut;
      }
    }
  } else if (expand && total < available) {
    let spare = available - total;
    while (spare > 0) {
      const room = metrics.map((metric, i) => (metric.flex > 0 ? Math.max(0, metric.ceiling - widths[i]) : 0));
      if (room.every((value) => value === 0)) break;
      const gains = distribute(spare, room.map((value, i) => (value > 0 ? metrics[i].flex : 0)));
      for (let i = 0; i < widths.length; i++) {
        const gain = Math.min(gains[i], room[i]);
        widths[i] += gain;
        spare -= gain;
      }
    }
  }
  return widths;
}
