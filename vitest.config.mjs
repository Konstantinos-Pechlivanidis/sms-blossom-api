/** @type {import('vitest').UserConfig} */
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    reporters: 'default',
    pool: 'threads',
  },
};
