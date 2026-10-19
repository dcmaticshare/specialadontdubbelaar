// Bestandskiezer en foutmelding tonen alle formaten die de inlezer ondersteunt.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';
import { FILE_ACCEPT } from '../src/io/read.js';

export async function controleBestandstypen(page) {
  const expected = FILE_ACCEPT.split(',').sort();
  const input = page.locator('input[type=file]');
  assert.deepEqual((await input.getAttribute('accept')).split(',').sort(), expected);
  await input.setInputFiles({ name: 'onbekend.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetisch') });
  const error = page.getByText(/"onbekend\.pdf": alleen/);
  await expect(error).toBeVisible();
  assert.deepEqual([...(await error.textContent()).matchAll(/\.(csv|txt|tsv|xlsx|xlsm|xlsb|xls|ods)\b/g)].map((m) => m[0]).sort(), expected);
}
