import { performance } from 'perf_hooks';

function benchmark() {
  const items = Array.from({ length: 10000 }, (_, i) => {
    const types = ['login', 'document', 'note', 'entity', 'other'];
    return { type: types[i % types.length], id: i };
  });

  const iterations = 1000;

  // Baseline (current multiple filters simulation)
  const startBaseline = performance.now();
  for (let i = 0; i < iterations; i++) {
    const stats = {
      total: items.length,
      logins: items.filter(i => i.type === 'login').length,
      docs: items.filter(i => i.type === 'document').length,
      notes: items.filter(i => i.type === 'note').length,
    };
  }
  const endBaseline = performance.now();

  // Current reduce (in Vault.jsx, but missing entity)
  const startCurrentReduce = performance.now();
  for (let i = 0; i < iterations; i++) {
    const stats = items.reduce((acc, item) => {
      if (item.type === 'login') acc.logins++;
      else if (item.type === 'document') acc.docs++;
      else if (item.type === 'note') acc.notes++;
      return acc;
    }, { total: items.length, logins: 0, docs: 0, notes: 0 });
  }
  const endCurrentReduce = performance.now();

  // Proposed reduce (all types)
  const startProposed = performance.now();
  for (let i = 0; i < iterations; i++) {
    const stats = items.reduce((acc, item) => {
      if (item.type === 'login') acc.logins++;
      else if (item.type === 'document') acc.docs++;
      else if (item.type === 'note') acc.notes++;
      else if (item.type === 'entity') acc.entities++;
      return acc;
    }, { total: items.length, logins: 0, docs: 0, notes: 0, entities: 0 });
  }
  const endProposed = performance.now();
}

benchmark();
