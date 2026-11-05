/**
 * Renderer dispatch by output format name.
 * @module render
 */

import { checkEnum } from '../validate.js';
import { renderText } from './text.js';
import { renderMarkdown } from './markdown.js';
import { renderCsv } from './csv.js';
import { renderHtml } from './html.js';

export const OUTPUT_FORMATS = /** @type {const} */ (['text', 'markdown', 'csv', 'html']);

const RENDERERS = { text: renderText, markdown: renderMarkdown, csv: renderCsv, html: renderHtml };

/**
 * Render a table in the named format.
 * @param {import('../table.js').Table} table
 * @param {'text' | 'markdown' | 'csv' | 'html'} [format]
 * @param {Record<string, any>} [options] options of the chosen renderer
 * @returns {string}
 */
export function render(table, format = 'text', options) {
  return RENDERERS[checkEnum('format', format, OUTPUT_FORMATS)](table, options);
}

export { renderText, renderMarkdown, renderCsv, renderHtml };
