import { copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
// Never overwrite an installation's existing identity/configuration.
await mkdir(new URL('../.openai/', import.meta.url), { recursive: true });
try {
  await copyFile(new URL('../.openai/hosting.example.json', import.meta.url), new URL('../.openai/hosting.json', import.meta.url), constants.COPYFILE_EXCL);
  console.log('Created local example hosting config. Replace YOUR_SITE_PROJECT_ID only for your own private Site before deploying.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing local hosting config preserved.');
}
