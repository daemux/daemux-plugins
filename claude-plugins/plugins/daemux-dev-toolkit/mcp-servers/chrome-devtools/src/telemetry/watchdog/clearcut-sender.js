/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from 'node:crypto';
import { logger } from '../../logger.js';
const SESSION_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
export class ClearcutSender {
    #appVersion;
    #osType;
    #sessionId;
    #sessionCreated;
    constructor(appVersion, osType) {
        this.#appVersion = appVersion;
        this.#osType = osType;
        this.#sessionId = crypto.randomUUID();
        this.#sessionCreated = Date.now();
    }
    async send(event) {
        this.#rotateSessionIfNeeded();
        const enrichedEvent = this.#enrichEvent(event);
        this.transport(enrichedEvent);
    }
    transport(event) {
        logger('Telemetry event', JSON.stringify(event, null, 2));
    }
    async sendShutdownEvent() {
        const shutdownEvent = {
            server_shutdown: {},
        };
        await this.send(shutdownEvent);
    }
    #rotateSessionIfNeeded() {
        if (Date.now() - this.#sessionCreated > SESSION_ROTATION_INTERVAL_MS) {
            this.#sessionId = crypto.randomUUID();
            this.#sessionCreated = Date.now();
        }
    }
    #enrichEvent(event) {
        return {
            ...event,
            session_id: this.#sessionId,
            app_version: this.#appVersion,
            os_type: this.#osType,
        };
    }
}
