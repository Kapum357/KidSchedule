# Export Queue Deployment Guide

## Overview

The export queue system requires Redis for job persistence and a long-running worker process for job execution. This guide covers deployment configuration and operational setup.

## Environment Variables

### Required Variables

```bash
# Redis Configuration (Upstash)
UPSTASH_REDIS_URL=redis://default:password@host:port
UPSTASH_REDIS_TOKEN=your_upstash_token

# Database
DATABASE_URL=postgresql://user:password@host:port/database
```

### Optional Variables

```bash
# Worker Configuration
EXPORT_WORKER_POLL_INTERVAL_MS=1000      # Queue poll frequency (default: 1s)
EXPORT_WORKER_MAX_RETRIES=3              # Max retry attempts (default: 3)
EXPORT_WORKER_RETRY_BACKOFF_MS=5000      # Retry delay (default: 5s)

# Storage (for export results)
EXPORT_STORAGE_TYPE=s3                   # s3, gcs, azure, local
AWS_S3_BUCKET=exports-bucket             # For S3 storage
AWS_S3_REGION=us-east-1
```

## Architecture

### Components

1. **API Server** (Next.js)
   - Receives export requests
   - Stores jobs in PostgreSQL
   - Enqueues jobs to Redis
   - Provides status endpoints and metrics

2. **Worker Process** (Node.js)
   - Runs as separate process (PM2 managed)
   - Polls Redis queue for jobs
   - Processes exports (generates files)
   - Uploads results to storage
   - Updates job status in PostgreSQL

3. **Storage Backend**
   - S3, GCS, or local filesystem
   - Stores generated export files
   - Provides download URLs to users

## Deployment Steps

### 1. Set Up Redis (Upstash)

```bash
# Go to https://upstash.com and create a Redis database
# Copy the connection details to your environment variables
```

### 2. Configure PostgreSQL

Ensure the `export_jobs` table exists. Run migration:

```bash
pnpm db:migrate -- 0018_export_queue.sql
```

### 3. Set Up File Storage

**Option A: AWS S3**
```bash
export AWS_S3_BUCKET=exports-dev
export AWS_S3_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret
```

**Option B: Local Storage**
```bash
export EXPORT_STORAGE_TYPE=local
export EXPORT_STORAGE_PATH=/data/exports
```

### 4. Deploy API Server

```bash
# Build and deploy Next.js app
pnpm build
# Use your hosting platform (Vercel, Railway, AWS, etc.)
```

### 5. Deploy Worker Process

#### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'export-worker',
    script: './lib/export-worker.ts',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_URL,
      UPSTASH_REDIS_TOKEN: process.env.UPSTASH_REDIS_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
    }
  }]
};
EOF

# Start worker
pm2 start ecosystem.config.js

# Save configuration for auto-restart
pm2 save
pm2 startup
```

#### Using Docker

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
EXPOSE 3000

# Start worker instead of Next.js server
CMD ["node", "--require", "ts-node/register", "lib/export-worker.ts"]
```

```bash
# Build and run
docker build -t export-worker .
docker run -e UPSTASH_REDIS_URL=... -e DATABASE_URL=... export-worker
```

### 6. Configure Monitoring

#### Health Check Endpoint

Monitor worker health via metrics endpoint:

```bash
curl https://your-app.com/api/exports/metrics
```

Expected response includes:
- Queue length
- Worker status (running/stopped)
- Success rate
- Health warnings

#### Log Aggregation

The worker logs to console with `[Worker]` prefix. Configure:
- CloudWatch Logs (AWS)
- Datadog
- Splunk
- ELK Stack

Example log pattern:
```
[Worker] Starting export queue worker...
[Worker] Processing job export-123 (schedule-pdf)...
[Worker] Job completed: export-123
[Worker] Stats - Processed: 42, Failed: 2, Queue: 5
```

#### Alerting Rules

Set up alerts for:
- Worker process down: `! workerStatus.isRunning`
- High queue: `queueLength > 1000`
- Low success rate: `successRate < 0.9`
- Failed jobs: `jobStats.failed > 10`

## Operational Checklist

### Pre-Deployment

- [ ] Redis connection tested
- [ ] Database migrations applied
- [ ] Storage backend configured
- [ ] Environment variables set
- [ ] Build passes successfully
- [ ] Tests pass (optional)

### Deployment

- [ ] API server deployed
- [ ] Worker process started
- [ ] Health check endpoint responds
- [ ] Sample export triggered and completed
- [ ] Download works
- [ ] Monitoring/alerting configured

### Post-Deployment

- [ ] Monitor metrics dashboard
- [ ] Check logs for errors
- [ ] Test export from admin interface
- [ ] Verify SMS relay still works (if applicable)
- [ ] Set up automated backups for DB/storage

## Troubleshooting

### Worker Process Not Running

```bash
# Check if process is running
pm2 list

# Restart
pm2 restart export-worker

# View logs
pm2 logs export-worker
```

### Redis Connection Failed

```bash
# Test connection
redis-cli -u $UPSTASH_REDIS_URL ping
# Should return: PONG
```

### Jobs Stuck in "Processing"

Manual recovery:

```sql
-- Find stuck jobs
SELECT * FROM export_jobs
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '1 hour';

-- Mark as failed
UPDATE export_jobs
SET status = 'failed', error = 'Timeout - manually recovered'
WHERE id = 'job-id';
```

### High Memory Usage

- Reduce `EXPORT_WORKER_POLL_INTERVAL_MS` to check queue less frequently
- Implement pagination for large exports
- Add memory limits to Docker container or PM2

## Scaling

### Horizontal Scaling (Multiple Workers)

For high export volume, run multiple worker processes:

```javascript
// ecosystem.config.js
apps: [
  {
    name: 'export-worker-1',
    script: './lib/export-worker.ts',
    instances: 1,
  },
  {
    name: 'export-worker-2',
    script: './lib/export-worker.ts',
    instances: 1,
  },
  {
    name: 'export-worker-3',
    script: './lib/export-worker.ts',
    instances: 1,
  },
]
```

Workers will automatically distribute jobs from the shared Redis queue.

### Rate Limiting

For API endpoints, add rate limiting:

```typescript
// Limit to 10 export requests per user per hour
```

### Job Timeout

Set reasonable timeouts based on file size:

```typescript
const TIMEOUT_BY_TYPE = {
  'schedule-pdf': 30 * 1000,      // 30 seconds
  'invoices-pdf': 60 * 1000,      // 60 seconds
  'messages-csv': 120 * 1000,     // 2 minutes
  'moments-archive': 300 * 1000,  // 5 minutes
};
```

## Maintenance

### Regular Tasks

- **Daily**: Monitor metrics and logs
- **Weekly**: Review failed jobs and retry manually if needed
- **Monthly**: Clean up old completed exports
- **Quarterly**: Review and optimize job processing times

### Cleanup Script

```sql
-- Archive old completed exports (older than 90 days)
DELETE FROM export_jobs
WHERE status = 'complete'
AND completed_at < NOW() - INTERVAL '90 days';
```

## Security Considerations

- [ ] Redis connection uses TLS (Upstash provides this)
- [ ] Database credentials in secure environment variables
- [ ] API endpoints require authentication
- [ ] Export files have appropriate access controls
- [ ] Temporary files cleaned up after upload
- [ ] Sensitive data not logged
- [ ] Worker process runs with least privileges

## Performance Targets

- API response time: < 100ms
- Job queue latency: < 5 seconds (queued → processing)
- Export generation time: varies by type
  - Schedule PDF: 5-10s
  - Invoices PDF: 10-30s
  - Messages CSV: 20-60s
  - Moments Archive: 30-120s

## Support

For issues or questions:
1. Check logs and metrics
2. Review troubleshooting section above
3. Check existing GitHub issues
4. Create new issue with:
   - Error logs
   - Metrics snapshot
   - Steps to reproduce
   - Environment details
