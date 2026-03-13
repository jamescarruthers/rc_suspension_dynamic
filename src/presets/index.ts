import type { PresetConfig } from '../types/suspension';

import * as buggy18 from './buggy18';
import * as buggy110 from './buggy110';
import * as touring110 from './touring110';

export { buggy18, buggy110, touring110 };

export const presetMap: Record<string, PresetConfig> = {
  'buggy18': buggy18,
  'buggy110': buggy110,
  'touring110': touring110,
};
