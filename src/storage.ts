import type { RedisLike } from "./toolkit/session/redis.js";

/**
 * Persistent storage for durable domain data (user profiles, generation jobs,
 * credit transactions). Uses Redis in production, in-memory Map for dev/test.
 * NEVER use an in-memory Map for data that must survive a restart in production.
 */

export interface UserProfile {
  telegram_id: number;
  display_name: string;
  consent_timestamp: number;
}

export interface GenerationJob {
  job_id: string;
  user_id: number;
  category?: string;
  custom_prompt?: string;
  image_count: number;
  status: "pending" | "generating" | "completed" | "failed";
  output_images: string[];
  created_at: number;
  selfie_file_id?: string;
}

export interface CreditTransaction {
  transaction_id: string;
  user_id: number;
  credits_added: number;
  timestamp: number;
  payment_status: "pending" | "completed" | "failed";
}

export interface DomainStore {
  getUserProfile(userId: number): Promise<UserProfile | null>;
  setUserProfile(userId: number, profile: UserProfile): Promise<void>;

  getJob(jobId: string): Promise<GenerationJob | null>;
  setJob(jobId: string, job: GenerationJob): Promise<void>;
  getUserJobs(userId: number): Promise<string[]>;
  addJobToUser(userId: number, jobId: string): Promise<void>;

  getTransaction(txId: string): Promise<CreditTransaction | null>;
  setTransaction(txId: string, tx: CreditTransaction): Promise<void>;
  getUserTransactions(userId: number): Promise<string[]>;
  addTransactionToUser(userId: number, txId: string): Promise<void>;
}

/** In-memory implementation for dev/test (not for production). */
export class MemoryDomainStore implements DomainStore {
  private profiles = new Map<number, UserProfile>();
  private jobs = new Map<string, GenerationJob>();
  private userJobs = new Map<number, string[]>();
  private transactions = new Map<string, CreditTransaction>();
  private userTransactions = new Map<number, string[]>();

  async getUserProfile(userId: number): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async setUserProfile(userId: number, profile: UserProfile): Promise<void> {
    this.profiles.set(userId, profile);
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async setJob(jobId: string, job: GenerationJob): Promise<void> {
    this.jobs.set(jobId, job);
  }

  async getUserJobs(userId: number): Promise<string[]> {
    return this.userJobs.get(userId) ?? [];
  }

  async addJobToUser(userId: number, jobId: string): Promise<void> {
    const jobs = this.userJobs.get(userId) ?? [];
    jobs.push(jobId);
    this.userJobs.set(userId, jobs);
  }

  async getTransaction(txId: string): Promise<CreditTransaction | null> {
    return this.transactions.get(txId) ?? null;
  }

  async setTransaction(txId: string, tx: CreditTransaction): Promise<void> {
    this.transactions.set(txId, tx);
  }

  async getUserTransactions(userId: number): Promise<string[]> {
    return this.userTransactions.get(userId) ?? [];
  }

  async addTransactionToUser(userId: number, txId: string): Promise<void> {
    const txs = this.userTransactions.get(userId) ?? [];
    txs.push(txId);
    this.userTransactions.set(userId, txs);
  }
}

/** Redis-backed implementation for production. */
export class RedisDomainStore implements DomainStore {
  constructor(private readonly client: RedisLike) {}

  private k(type: string, id: string | number): string {
    return `selfiestyle:${type}:${id}`;
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async setJson(key: string, value: unknown): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  async getUserProfile(userId: number): Promise<UserProfile | null> {
    return this.getJson<UserProfile>(this.k("user", userId));
  }

  async setUserProfile(userId: number, profile: UserProfile): Promise<void> {
    await this.setJson(this.k("user", userId), profile);
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    return this.getJson<GenerationJob>(this.k("job", jobId));
  }

  async setJob(jobId: string, job: GenerationJob): Promise<void> {
    await this.setJson(this.k("job", jobId), job);
  }

  async getUserJobs(userId: number): Promise<string[]> {
    const raw = await this.client.get(this.k("userjobs", userId));
    if (raw == null) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  async addJobToUser(userId: number, jobId: string): Promise<void> {
    const jobs = await this.getUserJobs(userId);
    jobs.push(jobId);
    await this.client.set(this.k("userjobs", userId), JSON.stringify(jobs));
  }

  async getTransaction(txId: string): Promise<CreditTransaction | null> {
    return this.getJson<CreditTransaction>(this.k("tx", txId));
  }

  async setTransaction(txId: string, tx: CreditTransaction): Promise<void> {
    await this.setJson(this.k("tx", txId), tx);
  }

  async getUserTransactions(userId: number): Promise<string[]> {
    const raw = await this.client.get(this.k("usertx", userId));
    if (raw == null) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  async addTransactionToUser(userId: number, txId: string): Promise<void> {
    const txs = await this.getUserTransactions(userId);
    txs.push(txId);
    await this.client.set(this.k("usertx", userId), JSON.stringify(txs));
  }
}

/** Singleton domain store — resolves from env at startup. */
let _store: DomainStore | null = null;

export function getDomainStore(): DomainStore {
  if (_store) return _store;
  const redisUrl = typeof process !== "undefined" ? process.env.REDIS_URL : undefined;
  if (redisUrl) {
    // Lazy-load ioredis (same pattern as toolkit/session/redis.ts)
    try {
      const { createRequire } = require("node:module");
      const req = createRequire(import.meta.url);
      const ioredis = req("ioredis");
      const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
      const client = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
      _store = new RedisDomainStore(client);
    } catch {
      _store = new MemoryDomainStore();
    }
  } else {
    _store = new MemoryDomainStore();
  }
  return _store;
}

/** Reset the singleton (test-only hook). */
export function _resetDomainStore(): void {
  _store = null;
}

/** Create a unique job ID. */
export function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a unique transaction ID. */
export function createTxId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
