/**
 * Webhook HTTP Server
 *
 * HTTP server that receives callbacks from QQ, verifies signatures,
 * handles URL validation, and dispatches events to the handler.
 */

import * as http from 'http';
import { verifySignature, signCallbackResponse } from './signature.js';
import { WebhookHandler, WebhookHandlerConfig } from './handler.js';
import type {
  WebhookPayload,
  WebhookOpCode,
  URLValidationPayload,
  WebhookConfig,
} from '../types.js';

export interface WebhookServerConfig {
  port: number;
  host?: string;
  path?: string;
  appSecret: string;
  handler: WebhookHandlerConfig;
}

export class WebhookServer {
  private server: http.Server | null = null;
  private config: WebhookServerConfig;
  private handler: WebhookHandler;

  constructor(config: WebhookServerConfig) {
    this.config = config;
    this.handler = new WebhookHandler(config.handler);
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const path = this.config.path || '/webhook';
      const host = this.config.host || '0.0.0.0';

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res, path);
      });

      this.server.on('error', (error) => {
        console.error('[QQ-Channel Webhook] Server error:', error);
        reject(error);
      });

      this.server.listen(this.config.port, host, () => {
        console.log(`[QQ-Channel Webhook] Server listening on ${host}:${this.config.port}${path}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[QQ-Channel Webhook] Server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    expectedPath: string
  ): void {
    // Only accept POST requests to the webhook path
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method !== 'POST' || url.pathname !== expectedPath) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Collect body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      this.processRequest(req, res, body);
    });
  }

  /**
   * Process the webhook request
   */
  private processRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string
  ): void {
    try {
      // Get signature headers
      const signature = req.headers['x-signature-ed25519'] as string | undefined;
      const timestamp = req.headers['x-signature-timestamp'] as string | undefined;

      // Parse payload
      let payload: WebhookPayload;
      try {
        payload = JSON.parse(body);
      } catch {
        console.error('[QQ-Channel Webhook] Failed to parse JSON body');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      console.log('[QQ-Channel Webhook] Received payload:', {
        op: payload.op,
        t: payload.t,
        id: payload.id,
      });
      console.log('[QQ-Channel Webhook] Raw body:', body);
      console.log('[QQ-Channel Webhook] Headers:', {
        signature: signature,
        timestamp: timestamp,
      });

      // Handle URL validation (op=13) - no signature verification needed
      if (payload.op === 13) {
        this.handleURLValidation(payload, res);
        return;
      }

      // Verify signature for other requests
      if (signature && timestamp) {
        if (!verifySignature(signature, timestamp, body, this.config.appSecret)) {
          console.error('[QQ-Channel Webhook] Signature verification failed');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature' }));
          return;
        }
        console.log('[QQ-Channel Webhook] Signature verified');
      } else {
        // Log warning but continue - some requests may not have signatures
        console.warn('[QQ-Channel Webhook] No signature headers present');
      }

      // Handle dispatch events (op=0)
      if (payload.op === 0) {
        this.handleDispatch(payload, res);
        return;
      }

      // Acknowledge other payloads
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'ok' }));
    } catch (error) {
      console.error('[QQ-Channel Webhook] Error processing request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle URL validation callback (op=13)
   */
  private handleURLValidation(payload: WebhookPayload, res: http.ServerResponse): void {
    const data = payload.d as URLValidationPayload;
    console.log('[QQ-Channel Webhook] URL validation request:', data);

    if (!data.plain_token || !data.event_ts) {
      console.error('[QQ-Channel Webhook] Invalid URL validation payload');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing plain_token or event_ts' }));
      return;
    }

    // Sign the response
    const signature = signCallbackResponse(
      data.event_ts,
      data.plain_token,
      this.config.appSecret
    );

    const response = {
      plain_token: data.plain_token,
      signature: signature,
    };

    console.log('[QQ-Channel Webhook] URL validation response:', response);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  }

  /**
   * Handle dispatch event (op=0)
   */
  private handleDispatch(payload: WebhookPayload, res: http.ServerResponse): void {
    // The event type is in the 't' field
    const eventType = payload.t;

    if (!eventType) {
      console.warn('[QQ-Channel Webhook] Dispatch without event type');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'ok' }));
      return;
    }

    // The event data is in the 'd' field
    const eventData = payload.d;

    // Acknowledge immediately to avoid timeout
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'ok' }));

    // Process the event asynchronously
    setImmediate(() => {
      this.handler.handleEvent(eventType, eventData);
    });
  }
}
