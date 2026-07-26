import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetTestDataFactories } from './tests/factories';

beforeEach(() => {
  resetTestDataFactories();
});
