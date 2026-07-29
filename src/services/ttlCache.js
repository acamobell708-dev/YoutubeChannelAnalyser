export class TtlCache {
  constructor({ ttlMs = 15 * 60 * 1000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key, value) {
    this.entries.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
    return value;
  }

  async getOrCreate(key, producer) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = Promise.resolve().then(producer);
    this.set(key, pending);

    try {
      return await pending;
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }

  clear() {
    this.entries.clear();
  }
}
