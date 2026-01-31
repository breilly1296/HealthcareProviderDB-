# Real-Time Updates Design Document

**Version**: 1.0
**Status**: Draft
**Last Updated**: 2024-01-15

## Table of Contents

1. [Overview](#overview)
2. [Technology Options](#technology-options)
3. [SSE Implementation](#sse-implementation)
4. [Backend Changes](#backend-changes)
5. [Frontend Changes](#frontend-changes)
6. [Event Broadcasting](#event-broadcasting)
7. [Scaling Considerations](#scaling-considerations)
8. [Cloud Run Considerations](#cloud-run-considerations)
9. [Rate Limiting](#rate-limiting)
10. [Monitoring](#monitoring)
11. [Implementation Checklist](#implementation-checklist)

---

## Overview

### Goal

Implement real-time push updates to clients, enabling:
- Live vote count updates without page refresh
- Instant notification when new verifications are submitted
- Real-time confidence score changes
- Collaborative verification experience

### Current State

Currently, clients must manually refresh to see updates:
- Vote counts are stale until page reload
- New verifications not visible until navigation
- Users may vote based on outdated information

### Use Cases

| Use Case | Trigger | Client Action |
|----------|---------|---------------|
| Vote count update | User votes on verification | Update vote display in real-time |
| New verification | User submits verification | Show notification, update list |
| Verification status change | Admin moderates | Update status indicator |
| Confidence score update | Vote threshold reached | Animate confidence change |

### Recommendation

**Server-Sent Events (SSE)** for MVP:
- Simpler to implement than WebSocket
- HTTP-based, works through most proxies/firewalls
- Built-in reconnection handling
- Sufficient for one-way server → client updates

WebSocket can be added later if bidirectional communication is needed.

---

## Technology Options

### Comparison Matrix

| Feature | SSE | WebSocket | Pusher/Ably |
|---------|-----|-----------|-------------|
| Direction | One-way (server → client) | Bidirectional | Bidirectional |
| Protocol | HTTP | WS/WSS | HTTP/WS |
| Browser Support | All modern | All modern | All modern |
| Auto-reconnect | Built-in | Manual | Built-in |
| Complexity | Low | Medium | Low (managed) |
| Scaling | Medium | Medium | Easy (managed) |
| Cost | Infrastructure only | Infrastructure only | Pay per message |
| Latency | Low (~50ms) | Very low (~10ms) | Low (~50ms) |

### Detailed Analysis

#### Server-Sent Events (SSE)

**Pros**:
- Simple HTTP-based protocol
- Native browser `EventSource` API
- Automatic reconnection with retry
- Works through HTTP proxies
- Text-based, easy to debug
- No additional dependencies

**Cons**:
- One-way only (server to client)
- Maximum ~6 connections per domain (HTTP/1.1)
- Text only (no binary)
- Less efficient for high-frequency updates

**Best For**: Notifications, live updates, dashboards

#### WebSocket

**Pros**:
- Full duplex communication
- Lower latency
- Binary and text support
- Single connection for both directions
- More efficient for high-frequency updates

**Cons**:
- More complex to implement
- Requires explicit reconnection logic
- May have issues with some proxies
- Stateful, harder to scale

**Best For**: Chat, gaming, collaborative editing

#### Managed Services (Pusher, Ably)

**Pros**:
- Handles scaling automatically
- Global infrastructure
- Built-in presence, channels
- Client libraries for all platforms
- Guaranteed delivery options

**Cons**:
- Monthly costs ($49-499+/month)
- Vendor lock-in
- Data leaves your infrastructure
- Additional latency hop

**Best For**: Large scale, global audience, limited engineering resources

### Recommendation

| Phase | Technology | Rationale |
|-------|------------|-----------|
| MVP | SSE | Simple, sufficient for vote updates |
| Scale | SSE + Redis Pub/Sub | Multi-instance support |
| Future | WebSocket | If bidirectional needed |

---

## SSE Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Real-Time Update Flow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  Client  │────►│   SSE    │◄────│   Event      │◄────│  Verification │   │
│  │  Browser │     │ Endpoint │     │  Broadcaster │     │  Handler      │   │
│  └──────────┘     └──────────┘     └──────────────┘     └──────────────┘   │
│       │                │                   │                    │           │
│       │   EventSource  │                   │                    │           │
│       │   Connection   │                   │                    │           │
│       │◄──────────────►│                   │                    │           │
│       │                │                   │                    │           │
│       │    event:      │                   │   broadcast()      │           │
│       │    vote_changed│◄──────────────────│◄───────────────────│           │
│       │    data: {...} │                   │                    │           │
│       │                │                   │                    │           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Event Types

| Event | Trigger | Data |
|-------|---------|------|
| `verification_added` | New verification submitted | Verification summary |
| `verification_updated` | Verification edited/moderated | Updated fields |
| `verification_removed` | Verification deleted | Verification ID |
| `vote_changed` | User votes | Vote counts |
| `confidence_updated` | Confidence recalculated | New confidence score |
| `heartbeat` | Every 30 seconds | Timestamp |

### Event Format

SSE events follow this format:

```
event: <event_type>
id: <event_id>
data: <json_payload>

```

**Example Events**:

```
event: vote_changed
id: evt_abc123
data: {"verificationId":"ver_xyz","npi":"1234567890","planId":"plan_123","upvotes":15,"downvotes":2,"netVotes":13}

event: verification_added
id: evt_def456
data: {"id":"ver_new","npi":"1234567890","planId":"plan_456","acceptsInsurance":true,"confidenceScore":75,"createdAt":"2024-01-15T10:30:00Z"}

event: heartbeat
id: evt_hb_789
data: {"timestamp":"2024-01-15T10:30:30Z","connections":42}

```

### Subscription Channels

| Channel Pattern | Description | Example |
|-----------------|-------------|---------|
| `/events/providers/:npi` | Updates for specific provider | `/events/providers/1234567890` |
| `/events/plans/:planId` | Updates for specific plan | `/events/plans/ABC123` |
| `/events/global` | System-wide updates | New features, maintenance |

---

## Backend Changes

### Event Routes

Create `packages/backend/src/routes/events.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eventBroadcaster } from '../services/eventBroadcaster';
import { sseRateLimiter } from '../middleware/rateLimiter';
import logger from '../utils/logger';

const router = Router();

// =============================================================================
// Schemas
// =============================================================================

const npiParamSchema = z.object({
  npi: z.string().length(10).regex(/^\d+$/),
});

const planIdParamSchema = z.object({
  planId: z.string().min(1).max(100),
});

// =============================================================================
// SSE Headers
// =============================================================================

function setSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

// =============================================================================
// Helper Functions
// =============================================================================

function sendEvent(
  res: Response,
  eventType: string,
  data: unknown,
  eventId?: string
): void {
  const id = eventId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  res.write(`event: ${eventType}\n`);
  res.write(`id: ${id}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendHeartbeat(res: Response): void {
  sendEvent(res, 'heartbeat', {
    timestamp: new Date().toISOString(),
    connections: eventBroadcaster.getConnectionCount(),
  });
}

// =============================================================================
// Provider Events
// =============================================================================

/**
 * GET /events/providers/:npi
 * Subscribe to real-time updates for a specific provider
 */
router.get(
  '/providers/:npi',
  sseRateLimiter,
  (req: Request, res: Response) => {
    const parseResult = npiParamSchema.safeParse(req.params);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid NPI format' });
      return;
    }

    const { npi } = parseResult.data;
    const clientId = `${req.ip}_${Date.now()}`;

    logger.info({ npi, clientId }, 'SSE connection opened');

    // Set SSE headers
    setSSEHeaders(res);

    // Send initial connection event
    sendEvent(res, 'connected', {
      npi,
      clientId,
      timestamp: new Date().toISOString(),
    });

    // Register connection with broadcaster
    eventBroadcaster.addConnection(npi, res, clientId);

    // Heartbeat interval
    const heartbeatInterval = setInterval(() => {
      try {
        sendHeartbeat(res);
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // Every 30 seconds

    // Handle client disconnect
    req.on('close', () => {
      logger.info({ npi, clientId }, 'SSE connection closed');
      clearInterval(heartbeatInterval);
      eventBroadcaster.removeConnection(npi, clientId);
    });

    req.on('error', (error) => {
      logger.error({ npi, clientId, error }, 'SSE connection error');
      clearInterval(heartbeatInterval);
      eventBroadcaster.removeConnection(npi, clientId);
    });
  }
);

// =============================================================================
// Plan Events
// =============================================================================

/**
 * GET /events/plans/:planId
 * Subscribe to real-time updates for a specific plan
 */
router.get(
  '/plans/:planId',
  sseRateLimiter,
  (req: Request, res: Response) => {
    const parseResult = planIdParamSchema.safeParse(req.params);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid plan ID' });
      return;
    }

    const { planId } = parseResult.data;
    const channelKey = `plan:${planId}`;
    const clientId = `${req.ip}_${Date.now()}`;

    logger.info({ planId, clientId }, 'SSE plan connection opened');

    setSSEHeaders(res);

    sendEvent(res, 'connected', {
      planId,
      clientId,
      timestamp: new Date().toISOString(),
    });

    eventBroadcaster.addConnection(channelKey, res, clientId);

    const heartbeatInterval = setInterval(() => {
      try {
        sendHeartbeat(res);
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    req.on('close', () => {
      logger.info({ planId, clientId }, 'SSE plan connection closed');
      clearInterval(heartbeatInterval);
      eventBroadcaster.removeConnection(channelKey, clientId);
    });

    req.on('error', (error) => {
      logger.error({ planId, clientId, error }, 'SSE plan connection error');
      clearInterval(heartbeatInterval);
      eventBroadcaster.removeConnection(channelKey, clientId);
    });
  }
);

// =============================================================================
// Global Events
// =============================================================================

/**
 * GET /events/global
 * Subscribe to system-wide events
 */
router.get(
  '/global',
  sseRateLimiter,
  (req: Request, res: Response) => {
    const clientId = `${req.ip}_${Date.now()}`;
    const channelKey = 'global';

    logger.info({ clientId }, 'SSE global connection opened');

    setSSEHeaders(res);

    sendEvent(res, 'connected', {
      channel: 'global',
      clientId,
      timestamp: new Date().toISOString(),
    });

    eventBroadcaster.addConnection(channelKey, res, clientId);

    const heartbeatInterval = setInterval(() => {
      try {
        sendHeartbeat(res);
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeatInterval);
      eventBroadcaster.removeConnection(channelKey, clientId);
    });
  }
);

// =============================================================================
// Debug Endpoint (Admin Only)
// =============================================================================

/**
 * GET /events/debug/stats
 * Get current SSE connection statistics (admin only)
 */
router.get('/debug/stats', (req: Request, res: Response) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.json({
    success: true,
    data: eventBroadcaster.getStats(),
  });
});

export default router;
```

### Event Broadcaster Service

Create `packages/backend/src/services/eventBroadcaster.ts`:

```typescript
import { Response } from 'express';
import logger from '../utils/logger';

// =============================================================================
// Types
// =============================================================================

interface Connection {
  response: Response;
  clientId: string;
  connectedAt: Date;
}

interface BroadcastStats {
  totalConnections: number;
  connectionsByChannel: Record<string, number>;
  eventsBroadcast: number;
  uptime: number;
}

type EventType =
  | 'verification_added'
  | 'verification_updated'
  | 'verification_removed'
  | 'vote_changed'
  | 'confidence_updated'
  | 'system_message';

// =============================================================================
// Event Broadcaster Class
// =============================================================================

class EventBroadcaster {
  private connections: Map<string, Map<string, Connection>> = new Map();
  private eventCount: number = 0;
  private startTime: Date = new Date();

  /**
   * Add a new SSE connection for a channel
   */
  addConnection(channel: string, response: Response, clientId: string): void {
    if (!this.connections.has(channel)) {
      this.connections.set(channel, new Map());
    }

    const channelConnections = this.connections.get(channel)!;
    channelConnections.set(clientId, {
      response,
      clientId,
      connectedAt: new Date(),
    });

    logger.debug({
      channel,
      clientId,
      totalConnections: this.getConnectionCount(),
    }, 'SSE connection added');
  }

  /**
   * Remove an SSE connection
   */
  removeConnection(channel: string, clientId: string): void {
    const channelConnections = this.connections.get(channel);
    if (channelConnections) {
      channelConnections.delete(clientId);

      // Clean up empty channels
      if (channelConnections.size === 0) {
        this.connections.delete(channel);
      }
    }

    logger.debug({
      channel,
      clientId,
      totalConnections: this.getConnectionCount(),
    }, 'SSE connection removed');
  }

  /**
   * Broadcast an event to all connections on a channel
   */
  broadcast(channel: string, eventType: EventType, data: unknown): void {
    const channelConnections = this.connections.get(channel);
    if (!channelConnections || channelConnections.size === 0) {
      return;
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify(data);
    const message = `event: ${eventType}\nid: ${eventId}\ndata: ${payload}\n\n`;

    let successCount = 0;
    let failCount = 0;
    const failedClients: string[] = [];

    channelConnections.forEach((connection, clientId) => {
      try {
        connection.response.write(message);
        successCount++;
      } catch (error) {
        failCount++;
        failedClients.push(clientId);
        logger.warn({ channel, clientId, error }, 'Failed to send SSE event');
      }
    });

    // Clean up failed connections
    failedClients.forEach(clientId => {
      this.removeConnection(channel, clientId);
    });

    this.eventCount++;

    logger.debug({
      channel,
      eventType,
      successCount,
      failCount,
    }, 'SSE broadcast completed');
  }

  /**
   * Broadcast to multiple channels at once
   */
  broadcastToMultiple(
    channels: string[],
    eventType: EventType,
    data: unknown
  ): void {
    channels.forEach(channel => {
      this.broadcast(channel, eventType, data);
    });
  }

  /**
   * Broadcast a verification event
   */
  broadcastVerification(
    npi: string,
    planId: string,
    eventType: 'verification_added' | 'verification_updated' | 'verification_removed',
    data: unknown
  ): void {
    // Broadcast to NPI channel
    this.broadcast(npi, eventType, data);

    // Also broadcast to plan channel
    this.broadcast(`plan:${planId}`, eventType, data);
  }

  /**
   * Broadcast a vote change event
   */
  broadcastVoteChange(
    npi: string,
    planId: string,
    verificationId: string,
    voteData: {
      upvotes: number;
      downvotes: number;
      netVotes: number;
    }
  ): void {
    const data = {
      verificationId,
      npi,
      planId,
      ...voteData,
      timestamp: new Date().toISOString(),
    };

    this.broadcast(npi, 'vote_changed', data);
    this.broadcast(`plan:${planId}`, 'vote_changed', data);
  }

  /**
   * Broadcast confidence score update
   */
  broadcastConfidenceUpdate(
    npi: string,
    planId: string,
    confidenceData: {
      confidenceScore: number;
      confidenceLevel: string;
      factors: unknown;
    }
  ): void {
    const data = {
      npi,
      planId,
      ...confidenceData,
      timestamp: new Date().toISOString(),
    };

    this.broadcast(npi, 'confidence_updated', data);
    this.broadcast(`plan:${planId}`, 'confidence_updated', data);
  }

  /**
   * Broadcast system-wide message
   */
  broadcastSystemMessage(message: string, level: 'info' | 'warning' | 'error'): void {
    this.broadcast('global', 'system_message', {
      message,
      level,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get total number of active connections
   */
  getConnectionCount(): number {
    let count = 0;
    this.connections.forEach(channelConnections => {
      count += channelConnections.size;
    });
    return count;
  }

  /**
   * Get number of connections for a specific channel
   */
  getChannelConnectionCount(channel: string): number {
    return this.connections.get(channel)?.size || 0;
  }

  /**
   * Get detailed statistics
   */
  getStats(): BroadcastStats {
    const connectionsByChannel: Record<string, number> = {};
    this.connections.forEach((connections, channel) => {
      connectionsByChannel[channel] = connections.size;
    });

    return {
      totalConnections: this.getConnectionCount(),
      connectionsByChannel,
      eventsBroadcast: this.eventCount,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Get list of active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Disconnect all clients on a channel (for maintenance)
   */
  disconnectChannel(channel: string, reason: string): void {
    const channelConnections = this.connections.get(channel);
    if (!channelConnections) return;

    channelConnections.forEach((connection) => {
      try {
        const message = `event: disconnect\ndata: ${JSON.stringify({ reason })}\n\n`;
        connection.response.write(message);
        connection.response.end();
      } catch (error) {
        // Ignore errors during disconnect
      }
    });

    this.connections.delete(channel);
    logger.info({ channel, reason }, 'SSE channel disconnected');
  }

  /**
   * Disconnect all clients (for shutdown)
   */
  disconnectAll(reason: string): void {
    const channels = Array.from(this.connections.keys());
    channels.forEach(channel => {
      this.disconnectChannel(channel, reason);
    });
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const eventBroadcaster = new EventBroadcaster();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down SSE connections');
  eventBroadcaster.disconnectAll('Server shutting down');
});

process.on('SIGINT', () => {
  logger.info('Shutting down SSE connections');
  eventBroadcaster.disconnectAll('Server shutting down');
});
```

### Register Routes

Update `packages/backend/src/routes/index.ts`:

```typescript
import eventRoutes from './events';

// ... existing routes ...

// Real-time events (SSE)
router.use('/events', eventRoutes);
```

---

## Frontend Changes

### useProviderEvents Hook

Create `packages/frontend/src/hooks/useProviderEvents.ts`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

interface VoteChangedEvent {
  verificationId: string;
  npi: string;
  planId: string;
  upvotes: number;
  downvotes: number;
  netVotes: number;
  timestamp: string;
}

interface VerificationEvent {
  id: string;
  npi: string;
  planId: string;
  acceptsInsurance: boolean;
  confidenceScore?: number;
  createdAt: string;
}

interface ConfidenceUpdatedEvent {
  npi: string;
  planId: string;
  confidenceScore: number;
  confidenceLevel: string;
  timestamp: string;
}

interface ProviderEventHandlers {
  onVoteChanged?: (data: VoteChangedEvent) => void;
  onVerificationAdded?: (data: VerificationEvent) => void;
  onVerificationUpdated?: (data: VerificationEvent) => void;
  onVerificationRemoved?: (data: { id: string }) => void;
  onConfidenceUpdated?: (data: ConfidenceUpdatedEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

interface UseProviderEventsOptions {
  enabled?: boolean;
  maxRetries?: number;
  baseRetryDelay?: number;
}

interface UseProviderEventsReturn {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  retryCount: number;
  disconnect: () => void;
  reconnect: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds

// =============================================================================
// Hook Implementation
// =============================================================================

export function useProviderEvents(
  npi: string | null,
  handlers: ProviderEventHandlers,
  options: UseProviderEventsOptions = {}
): UseProviderEventsReturn {
  const {
    enabled = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseRetryDelay = DEFAULT_BASE_RETRY_DELAY,
  } = options;

  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');
  const [retryCount, setRetryCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef(handlers);

  // Keep handlers ref up to date
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const disconnect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionState('disconnected');
    setRetryCount(0);
  }, []);

  const connect = useCallback(() => {
    if (!npi || !enabled) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionState('connecting');

    const url = `${API_BASE_URL}/api/v1/events/providers/${npi}`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.onopen = () => {
      setConnectionState('connected');
      setRetryCount(0);
      handlersRef.current.onConnected?.();
    };

    // Handle errors
    eventSource.onerror = (event) => {
      console.error('SSE connection error:', event);

      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionState('disconnected');
        handlersRef.current.onDisconnected?.();

        // Retry with exponential backoff
        if (retryCount < maxRetries) {
          const delay = Math.min(
            baseRetryDelay * Math.pow(2, retryCount),
            MAX_RETRY_DELAY
          );

          console.log(`Reconnecting in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

          retryTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1);
            connect();
          }, delay);
        } else {
          setConnectionState('error');
          handlersRef.current.onError?.(new Error('Max retries exceeded'));
        }
      }
    };

    // Handle connected event
    eventSource.addEventListener('connected', (event) => {
      console.log('SSE connected:', JSON.parse(event.data));
    });

    // Handle vote changes
    eventSource.addEventListener('vote_changed', (event) => {
      try {
        const data = JSON.parse(event.data) as VoteChangedEvent;
        handlersRef.current.onVoteChanged?.(data);
      } catch (error) {
        console.error('Failed to parse vote_changed event:', error);
      }
    });

    // Handle new verifications
    eventSource.addEventListener('verification_added', (event) => {
      try {
        const data = JSON.parse(event.data) as VerificationEvent;
        handlersRef.current.onVerificationAdded?.(data);
      } catch (error) {
        console.error('Failed to parse verification_added event:', error);
      }
    });

    // Handle updated verifications
    eventSource.addEventListener('verification_updated', (event) => {
      try {
        const data = JSON.parse(event.data) as VerificationEvent;
        handlersRef.current.onVerificationUpdated?.(data);
      } catch (error) {
        console.error('Failed to parse verification_updated event:', error);
      }
    });

    // Handle removed verifications
    eventSource.addEventListener('verification_removed', (event) => {
      try {
        const data = JSON.parse(event.data);
        handlersRef.current.onVerificationRemoved?.(data);
      } catch (error) {
        console.error('Failed to parse verification_removed event:', error);
      }
    });

    // Handle confidence updates
    eventSource.addEventListener('confidence_updated', (event) => {
      try {
        const data = JSON.parse(event.data) as ConfidenceUpdatedEvent;
        handlersRef.current.onConfidenceUpdated?.(data);
      } catch (error) {
        console.error('Failed to parse confidence_updated event:', error);
      }
    });

    // Handle heartbeat (optional logging)
    eventSource.addEventListener('heartbeat', () => {
      // Connection is alive
    });

    // Handle disconnect event from server
    eventSource.addEventListener('disconnect', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Server requested disconnect:', data.reason);
        disconnect();
      } catch (error) {
        disconnect();
      }
    });
  }, [npi, enabled, retryCount, maxRetries, baseRetryDelay, disconnect]);

  // Connect when NPI changes or enabled changes
  useEffect(() => {
    if (npi && enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [npi, enabled, connect, disconnect]);

  const reconnect = useCallback(() => {
    setRetryCount(0);
    connect();
  }, [connect]);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    retryCount,
    disconnect,
    reconnect,
  };
}

// =============================================================================
// Hook for Plan Events
// =============================================================================

export function usePlanEvents(
  planId: string | null,
  handlers: Omit<ProviderEventHandlers, 'onVerificationAdded' | 'onVerificationUpdated' | 'onVerificationRemoved'>,
  options: UseProviderEventsOptions = {}
): UseProviderEventsReturn {
  const {
    enabled = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseRetryDelay = DEFAULT_BASE_RETRY_DELAY,
  } = options;

  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');
  const [retryCount, setRetryCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const disconnect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionState('disconnected');
    setRetryCount(0);
  }, []);

  const connect = useCallback(() => {
    if (!planId || !enabled) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionState('connecting');

    const url = `${API_BASE_URL}/api/v1/events/plans/${encodeURIComponent(planId)}`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectionState('connected');
      setRetryCount(0);
      handlersRef.current.onConnected?.();
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionState('disconnected');
        handlersRef.current.onDisconnected?.();

        if (retryCount < maxRetries) {
          const delay = Math.min(
            baseRetryDelay * Math.pow(2, retryCount),
            MAX_RETRY_DELAY
          );

          retryTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1);
            connect();
          }, delay);
        } else {
          setConnectionState('error');
          handlersRef.current.onError?.(new Error('Max retries exceeded'));
        }
      }
    };

    eventSource.addEventListener('vote_changed', (event) => {
      try {
        const data = JSON.parse(event.data);
        handlersRef.current.onVoteChanged?.(data);
      } catch (error) {
        console.error('Failed to parse vote_changed event:', error);
      }
    });

    eventSource.addEventListener('confidence_updated', (event) => {
      try {
        const data = JSON.parse(event.data);
        handlersRef.current.onConfidenceUpdated?.(data);
      } catch (error) {
        console.error('Failed to parse confidence_updated event:', error);
      }
    });
  }, [planId, enabled, retryCount, maxRetries, baseRetryDelay, disconnect]);

  useEffect(() => {
    if (planId && enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [planId, enabled, connect, disconnect]);

  const reconnect = useCallback(() => {
    setRetryCount(0);
    connect();
  }, [connect]);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    retryCount,
    disconnect,
    reconnect,
  };
}
```

### Provider Detail Page Integration

Example usage in provider detail page:

```tsx
// packages/frontend/src/app/providers/[npi]/page.tsx

'use client';

import { useState, useCallback } from 'react';
import { useProviderEvents } from '@/hooks/useProviderEvents';

export default function ProviderDetailPage({ params }: { params: { npi: string } }) {
  const { npi } = params;

  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [newVerificationCount, setNewVerificationCount] = useState(0);

  // Set up real-time event handlers
  const handleVoteChanged = useCallback((data: VoteChangedEvent) => {
    setVerifications(prev =>
      prev.map(v =>
        v.id === data.verificationId
          ? { ...v, upvotes: data.upvotes, downvotes: data.downvotes }
          : v
      )
    );
  }, []);

  const handleVerificationAdded = useCallback((data: VerificationEvent) => {
    // Show notification for new verification
    setNewVerificationCount(prev => prev + 1);

    // Optionally add to list immediately
    // setVerifications(prev => [data, ...prev]);
  }, []);

  const handleConfidenceUpdated = useCallback((data: ConfidenceUpdatedEvent) => {
    // Update confidence display
    console.log('Confidence updated:', data);
  }, []);

  const { isConnected, connectionState } = useProviderEvents(npi, {
    onVoteChanged: handleVoteChanged,
    onVerificationAdded: handleVerificationAdded,
    onConfidenceUpdated: handleConfidenceUpdated,
    onConnected: () => console.log('Connected to real-time updates'),
    onDisconnected: () => console.log('Disconnected from real-time updates'),
  });

  return (
    <div>
      {/* Connection status indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-gray-300'
          }`}
        />
        {isConnected ? 'Live updates' : 'Connecting...'}
      </div>

      {/* New verification notification */}
      {newVerificationCount > 0 && (
        <button
          onClick={() => {
            // Refresh verifications
            setNewVerificationCount(0);
          }}
          className="bg-blue-100 text-blue-800 px-4 py-2 rounded"
        >
          {newVerificationCount} new verification{newVerificationCount > 1 ? 's' : ''} - Click to refresh
        </button>
      )}

      {/* Verification list */}
      <div>
        {verifications.map(verification => (
          <VerificationCard
            key={verification.id}
            verification={verification}
            // Vote counts update in real-time via handleVoteChanged
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Event Broadcasting

### Integration with Verification Handler

Update `packages/backend/src/services/verificationService.ts`:

```typescript
import { eventBroadcaster } from './eventBroadcaster';

export async function submitVerification(data: SubmitVerificationInput) {
  // ... existing validation and database insert ...

  const result = await prisma.$transaction(async (tx) => {
    // Create verification
    const verification = await tx.verificationLog.create({
      data: { /* ... */ },
    });

    // Update plan acceptance
    const acceptance = await tx.planAcceptance.upsert({
      /* ... */
    });

    return { verification, acceptance };
  });

  // Broadcast real-time event
  eventBroadcaster.broadcastVerification(
    data.npi,
    data.planId,
    'verification_added',
    {
      id: result.verification.id,
      npi: data.npi,
      planId: data.planId,
      acceptsInsurance: data.acceptsInsurance,
      confidenceScore: result.acceptance.confidenceScore,
      createdAt: result.verification.createdAt.toISOString(),
    }
  );

  return result;
}

export async function voteOnVerification(
  verificationId: string,
  vote: 'up' | 'down',
  sourceIp: string
) {
  // ... existing vote logic ...

  const result = await prisma.$transaction(async (tx) => {
    // Update vote counts
    const updatedVerification = await tx.verificationLog.update({
      where: { id: verificationId },
      data: {
        upvotes: vote === 'up' ? { increment: 1 } : undefined,
        downvotes: vote === 'down' ? { increment: 1 } : undefined,
      },
      include: {
        acceptance: true,
      },
    });

    return updatedVerification;
  });

  // Broadcast real-time event
  eventBroadcaster.broadcastVoteChange(
    result.npi,
    result.planId,
    verificationId,
    {
      upvotes: result.upvotes,
      downvotes: result.downvotes,
      netVotes: result.upvotes - result.downvotes,
    }
  );

  return result;
}
```

---

## Scaling Considerations

### Single Instance (MVP)

The in-memory `EventBroadcaster` works for a single instance:
- Simple, no external dependencies
- Connections stored in memory
- Limited by instance memory

### Multi-Instance (Production)

For multiple Cloud Run instances, use Redis Pub/Sub:

Create `packages/backend/src/services/redisPubSub.ts`:

```typescript
import Redis from 'ioredis';
import { eventBroadcaster } from './eventBroadcaster';
import logger from '../utils/logger';

// =============================================================================
// Configuration
// =============================================================================

const REDIS_URL = process.env.REDIS_URL;
const CHANNEL_PREFIX = 'sse:';

// =============================================================================
// Redis Pub/Sub Manager
// =============================================================================

class RedisPubSubManager {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private subscribedChannels: Set<string> = new Set();
  private isEnabled: boolean = false;

  async initialize(): Promise<void> {
    if (!REDIS_URL) {
      logger.info('Redis not configured, using local-only broadcasting');
      return;
    }

    try {
      this.publisher = new Redis(REDIS_URL);
      this.subscriber = new Redis(REDIS_URL);
      this.isEnabled = true;

      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

      logger.info('Redis Pub/Sub initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis Pub/Sub');
    }
  }

  /**
   * Subscribe to a channel (called when first SSE connection for NPI)
   */
  async subscribeToChannel(channel: string): Promise<void> {
    if (!this.isEnabled || !this.subscriber) return;

    const redisChannel = CHANNEL_PREFIX + channel;

    if (this.subscribedChannels.has(redisChannel)) return;

    await this.subscriber.subscribe(redisChannel);
    this.subscribedChannels.add(redisChannel);

    logger.debug({ channel: redisChannel }, 'Subscribed to Redis channel');
  }

  /**
   * Unsubscribe from a channel (called when last SSE connection for NPI closes)
   */
  async unsubscribeFromChannel(channel: string): Promise<void> {
    if (!this.isEnabled || !this.subscriber) return;

    const redisChannel = CHANNEL_PREFIX + channel;

    if (!this.subscribedChannels.has(redisChannel)) return;

    await this.subscriber.unsubscribe(redisChannel);
    this.subscribedChannels.delete(redisChannel);

    logger.debug({ channel: redisChannel }, 'Unsubscribed from Redis channel');
  }

  /**
   * Publish an event to all instances
   */
  async publish(
    channel: string,
    eventType: string,
    data: unknown
  ): Promise<void> {
    if (!this.isEnabled || !this.publisher) {
      // Fall back to local-only broadcast
      eventBroadcaster.broadcast(channel, eventType as any, data);
      return;
    }

    const redisChannel = CHANNEL_PREFIX + channel;
    const message = JSON.stringify({ eventType, data });

    await this.publisher.publish(redisChannel, message);

    logger.debug({ channel: redisChannel, eventType }, 'Published to Redis');
  }

  /**
   * Handle incoming message from Redis
   */
  private handleMessage(redisChannel: string, message: string): void {
    try {
      const channel = redisChannel.replace(CHANNEL_PREFIX, '');
      const { eventType, data } = JSON.parse(message);

      // Broadcast to local SSE connections
      eventBroadcaster.broadcast(channel, eventType, data);

      logger.debug({ channel, eventType }, 'Received message from Redis');
    } catch (error) {
      logger.error({ error, message }, 'Failed to handle Redis message');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    if (this.publisher) {
      await this.publisher.quit();
    }
  }
}

// =============================================================================
// Export Singleton
// =============================================================================

export const redisPubSub = new RedisPubSubManager();

// Initialize on import
redisPubSub.initialize().catch(err => {
  logger.error({ err }, 'Failed to initialize Redis Pub/Sub');
});

// Graceful shutdown
process.on('SIGTERM', () => redisPubSub.shutdown());
process.on('SIGINT', () => redisPubSub.shutdown());
```

### Updated Event Broadcaster for Multi-Instance

```typescript
// In eventBroadcaster.ts, modify addConnection and broadcast:

import { redisPubSub } from './redisPubSub';

class EventBroadcaster {
  // ... existing code ...

  async addConnection(channel: string, response: Response, clientId: string): void {
    // ... existing code ...

    // Subscribe to Redis channel if this is the first connection
    if (channelConnections.size === 1) {
      await redisPubSub.subscribeToChannel(channel);
    }
  }

  async removeConnection(channel: string, clientId: string): void {
    // ... existing code ...

    // Unsubscribe from Redis if no more local connections
    if (!this.connections.has(channel)) {
      await redisPubSub.unsubscribeFromChannel(channel);
    }
  }

  // Use this for cross-instance broadcasts
  async broadcastCrossInstance(
    channel: string,
    eventType: EventType,
    data: unknown
  ): void {
    await redisPubSub.publish(channel, eventType, data);
  }
}
```

---

## Cloud Run Considerations

### Request Timeout

Cloud Run has a maximum request timeout. Configure for SSE:

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: verifymyprovider-backend
spec:
  template:
    metadata:
      annotations:
        # Maximum timeout for SSE connections (1 hour)
        run.googleapis.com/request-timeout: "3600"
    spec:
      containers:
        - image: gcr.io/PROJECT/verifymyprovider-backend
          resources:
            limits:
              cpu: "1"
              memory: 512Mi
```

Or via gcloud:

```bash
gcloud run services update verifymyprovider-backend \
  --timeout=3600 \
  --region=us-central1
```

### Connection Limits

| Consideration | Recommendation |
|---------------|----------------|
| Max connections per instance | 1000 (conservative) |
| Memory per connection | ~1-5 KB |
| Instances | Auto-scale based on connections |
| Min instances | 1 (to avoid cold start) |

### Dedicated SSE Instance (Optional)

For high-traffic scenarios, run a dedicated instance for SSE:

```bash
# Create dedicated SSE service
gcloud run deploy verifymyprovider-sse \
  --image=gcr.io/PROJECT/verifymyprovider-backend \
  --timeout=3600 \
  --min-instances=1 \
  --max-instances=10 \
  --cpu=1 \
  --memory=512Mi \
  --set-env-vars="SSE_ONLY=true"
```

Route `/events/*` to the dedicated service via load balancer.

---

## Rate Limiting

### SSE Connection Limits

Add to `packages/backend/src/middleware/rateLimiter.ts`:

```typescript
// =============================================================================
// SSE Connection Rate Limiter
// =============================================================================

// Track SSE connections per IP
const sseConnectionCounts = new Map<string, number>();

export const sseRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  const maxConcurrentConnections = 5; // Max SSE connections per IP

  const currentConnections = sseConnectionCounts.get(ip) || 0;

  if (currentConnections >= maxConcurrentConnections) {
    logger.warn({ ip, currentConnections }, 'SSE connection limit exceeded');
    res.status(429).json({
      error: 'Too many concurrent connections',
      maxConnections: maxConcurrentConnections,
    });
    return;
  }

  // Increment connection count
  sseConnectionCounts.set(ip, currentConnections + 1);

  // Decrement on close
  res.on('close', () => {
    const count = sseConnectionCounts.get(ip) || 1;
    if (count <= 1) {
      sseConnectionCounts.delete(ip);
    } else {
      sseConnectionCounts.set(ip, count - 1);
    }
  });

  next();
};

// Cleanup stale entries periodically
setInterval(() => {
  // This is a simple cleanup - in production, use more sophisticated tracking
  logger.debug({ connectionCount: sseConnectionCounts.size }, 'SSE connection tracking');
}, 60000);
```

---

## Monitoring

### Metrics to Track

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `sse_connections_total` | Total active SSE connections | > 10,000 |
| `sse_connections_by_channel` | Connections per channel | > 1,000 per channel |
| `sse_events_broadcast_total` | Events broadcast | Rate > 1,000/min |
| `sse_connection_duration` | Connection lifetime | Avg < 5 min (possible issue) |
| `sse_errors_total` | Connection errors | Rate > 10/min |

### Logging

```typescript
// Structured logging for SSE events
logger.info({
  event: 'sse_connection_opened',
  channel: npi,
  clientId,
  totalConnections: eventBroadcaster.getConnectionCount(),
});

logger.info({
  event: 'sse_broadcast',
  channel: npi,
  eventType: 'vote_changed',
  recipientCount: channelConnections.size,
});

logger.warn({
  event: 'sse_connection_failed',
  channel: npi,
  clientId,
  error: error.message,
});
```

### Admin Dashboard Metrics

Add to admin stats endpoint:

```typescript
// GET /api/v1/admin/sse/stats
router.get('/sse/stats', adminAuthMiddleware, (req, res) => {
  const stats = eventBroadcaster.getStats();

  res.json({
    success: true,
    data: {
      ...stats,
      channelBreakdown: stats.connectionsByChannel,
      topChannels: Object.entries(stats.connectionsByChannel)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10),
    },
  });
});
```

### Cloud Monitoring Alert

```bash
gcloud alpha monitoring policies create \
  --display-name="High SSE Connection Count" \
  --condition-display-name="SSE connections spike" \
  --condition-filter='
    metric.type="custom.googleapis.com/sse/connections"
    resource.type="cloud_run_revision"
  ' \
  --condition-threshold-value=5000 \
  --condition-threshold-duration=300s \
  --notification-channels=YOUR_CHANNEL_ID
```

---

## Implementation Checklist

### Phase 1: Backend Foundation

- [ ] Create `packages/backend/src/routes/events.ts`
- [ ] Create `packages/backend/src/services/eventBroadcaster.ts`
- [ ] Add SSE rate limiter
- [ ] Register event routes in main router
- [ ] Add heartbeat mechanism
- [ ] Add connection cleanup on disconnect

### Phase 2: Event Integration

- [ ] Add broadcast calls to verification submission
- [ ] Add broadcast calls to vote handler
- [ ] Add broadcast calls to confidence updates
- [ ] Test event broadcasting locally

### Phase 3: Frontend Integration

- [ ] Create `useProviderEvents` hook
- [ ] Create `usePlanEvents` hook
- [ ] Add connection status indicator
- [ ] Integrate with provider detail page
- [ ] Add "new verification" notification
- [ ] Implement auto-reconnect with backoff

### Phase 4: Scaling

- [ ] Create `redisPubSub.ts` service
- [ ] Update broadcaster for multi-instance
- [ ] Test with multiple instances
- [ ] Configure Cloud Run timeout

### Phase 5: Monitoring

- [ ] Add SSE metrics logging
- [ ] Create admin stats endpoint
- [ ] Set up Cloud Monitoring alerts
- [ ] Add connection tracking dashboard

### Phase 6: Testing

- [ ] Unit tests for event broadcaster
- [ ] Unit tests for frontend hooks
- [ ] Integration tests for SSE endpoints
- [ ] Load testing for connection limits
- [ ] Test reconnection behavior

---

## Appendix: Event Reference

### Event: vote_changed

```json
{
  "verificationId": "ver_abc123",
  "npi": "1234567890",
  "planId": "plan_xyz",
  "upvotes": 15,
  "downvotes": 2,
  "netVotes": 13,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Event: verification_added

```json
{
  "id": "ver_new123",
  "npi": "1234567890",
  "planId": "plan_xyz",
  "acceptsInsurance": true,
  "acceptsNewPatients": true,
  "confidenceScore": 75,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Event: verification_updated

```json
{
  "id": "ver_abc123",
  "npi": "1234567890",
  "planId": "plan_xyz",
  "acceptsInsurance": false,
  "status": "MODERATED",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Event: confidence_updated

```json
{
  "npi": "1234567890",
  "planId": "plan_xyz",
  "confidenceScore": 85,
  "confidenceLevel": "HIGH",
  "factors": {
    "verificationCount": 10,
    "recentActivity": true,
    "userTrustWeight": 1.2
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Event: heartbeat

```json
{
  "timestamp": "2024-01-15T10:30:30Z",
  "connections": 42
}
```

### Event: system_message

```json
{
  "message": "Scheduled maintenance in 30 minutes",
  "level": "warning",
  "timestamp": "2024-01-15T10:30:00Z"
}
```
