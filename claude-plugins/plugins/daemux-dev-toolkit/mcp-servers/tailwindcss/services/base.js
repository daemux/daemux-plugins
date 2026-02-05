/**
 * Base service interfaces and abstract classes for TailwindCSS MCP Server
 */
/**
 * Abstract base class for cached services
 */
export class CachedService {
    cache = new Map();
    cacheHits = 0;
    cacheRequests = 0;
    lastCleanup = new Date();
    async initialize() {
        // Override in subclasses
    }
    async cleanup() {
        this.cache.clear();
    }
    async clearCache() {
        this.cache.clear();
        this.cacheHits = 0;
        this.cacheRequests = 0;
        this.lastCleanup = new Date();
    }
    getCacheStats() {
        return {
            totalEntries: this.cache.size,
            memoryUsage: this.estimateMemoryUsage(),
            hitRate: this.cacheRequests > 0 ? this.cacheHits / this.cacheRequests : 0,
            lastCleanup: this.lastCleanup,
        };
    }
    updateCacheStats(isHit) {
        this.cacheRequests++;
        if (isHit) {
            this.cacheHits++;
        }
    }
    isCacheExpired(item, ttlMs = 24 * 60 * 60 * 1000) {
        return Date.now() - item.lastUpdated.getTime() > ttlMs;
    }
    estimateMemoryUsage() {
        let totalSize = 0;
        for (const [key, value] of this.cache) {
            totalSize += key.length * 2; // Rough estimate for string keys
            totalSize += value.content.length * 2; // Rough estimate for content
            totalSize += value.url.length * 2; // URL size
            totalSize += 200; // Rough estimate for other properties and overhead
        }
        return totalSize;
    }
}
/**
 * Error handling utilities
 */
export class ServiceError extends Error {
    service;
    operation;
    originalError;
    constructor(message, service, operation, originalError) {
        super(message);
        this.service = service;
        this.operation = operation;
        this.originalError = originalError;
        this.name = 'ServiceError';
    }
}
/**
 * Service registry for managing service instances
 */
export class ServiceRegistry {
    services = new Map();
    register(name, service) {
        this.services.set(name, service);
    }
    get(name) {
        return this.services.get(name);
    }
    async initializeAll() {
        const initPromises = Array.from(this.services.values()).map(service => service.initialize().catch(error => {
            console.error(`Failed to initialize service:`, error);
            throw error;
        }));
        await Promise.all(initPromises);
    }
    async cleanupAll() {
        const cleanupPromises = Array.from(this.services.values()).map(service => service.cleanup().catch(error => {
            console.error(`Failed to cleanup service:`, error);
            // Continue cleanup even if one service fails
        }));
        await Promise.allSettled(cleanupPromises);
    }
}
