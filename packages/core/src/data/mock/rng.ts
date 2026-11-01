/** PRNG determinístico (mulberry32): o mock gera sempre o mesmo mundo, então telas e screenshots são estáveis. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Uniforme em [min, max). */
    between: (min: number, max: number) => min + (max - min) * next(),
    /** Arredonda com probabilidade proporcional à parte fracionária (preserva a média em contagens pequenas). */
    roundStochastic: (x: number) => {
      const floor = Math.floor(x);
      return floor + (next() < x - floor ? 1 : 0);
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
