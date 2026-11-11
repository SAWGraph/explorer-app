export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function deepEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
