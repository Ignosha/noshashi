# IGNOSHASHI — Production Readiness & Scaling Guide

## 1. Production Readiness Checklist

### Security
- [ ] **Enable HTTPS** — Use Cloudflare (free) or Let's Encrypt in front of the Express server
- [ ] **Add rate limiting** — Prevent abuse on `/api/trade`, `/api/create`, `/api/community/*`
- [ ] **API key enforcement** — Make `/api/trade` and `/api/create` require `X-API-Key` header for bot access
- [ ] **Input sanitization** — Add express-validator or manual sanitization on all POST endpoints
- [ ] **CORS lockdown** — Restrict `cors()` to your domain in production
- [ ] **Helmet.js** — Add security headers
- [ ] **SQL injection review** — Parameterized queries are used (good), but validate all inputs
- [ ] **Private key security** — Built-in wallet keys are server-side only (good), ensure DB file permissions are `600`

### Infrastructure
- [ ] **Process manager** — Use `pm2` or systemd to keep the server running
- [ ] **Database backups** — SQLite DB at `ignoshashi.db` — backup every hour
- [ ] **Logging** — Add winston or pino for structured logs
- [ ] **Health check endpoint** — `/health` for uptime monitoring
- [ ] **Graceful shutdown** — Handle SIGTERM to close DB connections

### Monitoring (free/cheap)
- [ ] **Uptime** — UptimeRobot (free) pings `http://your-domain/health`
- [ ] **Errors** — Sentry (free tier) or GlitchTip for error tracking
- [ ] **Logs** — Papertrail (free tier) or Loki + Grafana (self-hosted)
- [ ] **Metrics** — Prometheus + Grafana (free) or Datadog free tier

## 2. Scaling on a Budget (< $50/month)

### Architecture
```
Internet → Cloudflare (free CDN + DDoS) → Your Server → SQLite (or PostgreSQL)
```

### Hosting Options (cheapest first)

| Option | Cost | Notes |
|--------|------|-------|
| **VPS (DigitalOcean/Hetzner)** | $4–6/mo | Hetzner CX11 (~€4/mo) — best value |
| **VPS (Vultr/Linode)** | $5/mo | Good performance |
| **Oracle Cloud Free Tier** | $0/mo | 2 OCPU + 1GB RAM forever |
| **AWS Lightsail** | $3.50/mo | Includes SSD + transfer |
| **Render/Railway** | $5–7/mo | Managed, auto-deploy from Git |
| **Fly.io** | $0–5/mo | Free tier with 3 shared VMs |

### Recommended: Hetzner CX11 + Cloudflare
- **Hetzner CX11**: ~€4/mo ($4.50), 2GB RAM, 1 vCPU, 20GB SSD
- **Cloudflare**: Free CDN + DDoS protection + SSL
- **Total**: ~$5/month for production

### Database Scaling
- **SQLite → PostgreSQL** when you hit ~100k rows or need concurrent writes
  - Supabase (free tier): 500MB, 2 projects free
  - Neon.tech (free tier): 0.5GB, serverless Postgres
  - Migration: `sqlite3_to_postgres` or use Prisma/Drizzle ORM

### File Storage (for videos/images)
- **Cloudflare R2**: 10GB free, $0.015/GB after — no egress fees
- **Backblaze B2**: 10GB free, $0.005/GB + $0.01/GB egress
- **S3-compatible**: MinIO self-hosted if you have disk space

### CDN / Static Assets
- **Cloudflare Pages**: Free hosting for `public/` folder
- **Netlify**: Free tier, 100GB bandwidth
- **Vercel**: Free for frontend, but your server is still needed for API

## 3. Code Production Hardening

### Rate Limiting (add to server.js)
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60_000,
  max: 30, // 30 requests per minute per IP
  message: { error: 'Too many requests, slow down!' },
});
app.use('/api/', limiter);

// Stricter for sensitive endpoints
const tradeLimiter = rateLimit({
  windowMs: 60_000,
  max: 5, // 5 trades per minute
  message: { error: 'Trade rate limit exceeded' },
});
app.post('/api/trade', tradeLimiter, ...);
app.post('/api/create', tradeLimiter, ...);
```

### Helmet + CORS
```javascript
const helmet = require('helmet');
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
```

### Health Check
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), db: db ? 'ok' : 'error' });
});
```

### Graceful Shutdown
```javascript
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  db.close();
  server.close(() => process.exit(0));
});
```

## 4. Scaling Steps (ordered by cost/benefit)

### Phase 1: Free (< $0/month)
1. Add rate limiting to server.js
2. Add `/health` endpoint
3. Add `express-rate-limit` and `helmet` to dependencies
4. Enable Cloudflare (free) — set nameservers, get SSL + CDN
5. Set up UptimeRobot (free) to monitor `/health`
6. Add `.gitignore` and commit to Git (GitHub/GitLab free)

### Phase 2: $5/month
1. Deploy to Hetzner CX11 ($4.50/mo) or Oracle Free Tier ($0)
2. Set up PM2 for process management: `pm2 start server.js --name ignoshashi`
3. Configure daily SQLite backups: `0 2 * * * cp /path/to/ignoshashi.db /backups/ignoshashi_$(date +%F).db`
4. Add Sentry (free 5k events/mo) for error tracking
5. Enable Cloudflare WAF rules (free)

### Phase 3: $15–30/month (growth)
1. Move DB to Supabase/Neon (free → $9/mo at 8GB)
2. Add file storage (Cloudflare R2 — $0.015/GB)
3. Scale server to 2 vCPU + 4GB RAM ($10–15/mo)
4. Add Redis for caching (Upstash free tier or self-hosted)
5. Set up CI/CD (GitHub Actions — free)

### Phase 4: $50+/month (production scale)
1. Load balancer + 2+ app servers
2. PostgreSQL with read replicas
3. S3-compatible object storage for video
4. Dedicated Redis cluster
5. Prometheus + Grafana monitoring stack
6. Staging environment

## 5. Immediate Action Items

### Critical (do now):
```bash
# 1. Install production deps
npm install express-rate-limit helmet

# 2. Set up PM2
npm install -g pm2
pm2 start server.js --name ignoshashi
pm2 startup
pm2 save

# 3. Add to .env (production):
ALLOWED_ORIGIN=https://yourdomain.com
NODE_ENV=production

# 4. Set up backup cron
(crontab -l 2>/dev/null; echo "0 2 * * * cp $PWD/ignoshashi.db $PWD/backups/ignoshashi_\$(date +\%F).db") | crontab -
```

### Important (this week):
- [ ] Add rate limiting middleware to server.js
- [ ] Add `/health` endpoint
- [ ] Set up Cloudflare for your domain
- [ ] Enable Sentry for error tracking
- [ ] Test mainnet with a small real transaction

### Nice-to-have (next month):
- [ ] Migrate SQLite → PostgreSQL
- [ ] Add video upload to Cloudflare R2
- [ ] Implement API key auth for bot endpoints
- [ ] Add user authentication (wallet-based sessions)

## 6. Estimated Costs at Scale

| Users | Monthly Cost | Stack |
|-------|-------------|-------|
| 0–100 | $0–5/mo | Single VPS + SQLite + Cloudflare free |
| 100–1,000 | $10–20/mo | 2 vCPU VPS + PostgreSQL free tier + R2 |
| 1,000–10,000 | $50–100/mo | Load balancer + 2 servers + PostgreSQL + Redis + CDN |
| 10,000+ | $200+/mo | K8s/EKS + managed DB + object storage + full monitoring |

## 7. Quick Wins for User Experience

1. **Transaction receipts** — Already implemented (explorer links)
2. **Real-time WS** — Already implemented for trades/chat
3. **Mobile responsive** — Partially done, enhance community/video for mobile
4. **Push notifications** — Add web push for price alerts
5. **Wallet persistence** — Already implemented (adoptSession + wallet_sessions)
6. **Token verification** — Add "verified" badge for tokens with real on-chain deployment
