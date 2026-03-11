// Simple UUID mock for tests
module.exports = {
  v4: () => {
    return 'mock-uuid-' + Math.random().toString(36).slice(2, 11);
  },
  validate: () => true,
  version: () => 4,
  NIL: '00000000-0000-0000-0000-000000000000',
};
