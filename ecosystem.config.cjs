// PM2 Ecosystem Configuration
// Per PRD: Executive loop runs continuously via PM2
// Start: pm2 start ecosystem.config.cjs
// Monitor: pm2 monit
// Logs: pm2 logs executive-loop

module.exports = {
  apps: [
    {
      // Main executive loop process
      name: 'executive-loop',
      script: 'dist/core/executive-loop.js',
      cwd: '/Users/jackjin/dev/continuous-agent',

      // Environment
      // Continuous execution: agent continues immediately after work completes
      // Only sleeps when idle (queue empty) or unhealthy
      node_args: '--experimental-specifier-resolution=node',
      env: {
        // NOTE: Using 'development' to ensure npm installs devDependencies
        // 'production' was causing workers to fail npm install for TypeScript
        NODE_ENV: 'development',
        // AGENT_OUTPUTS_PATH intentionally NOT set here — the v2.3 default
        // (getLegacyMonorepoWorktreePath()) routes the centralized
        // CLAUDE.md/.env/.env.app/.claude/ setup into the legacy worktree
        // instead of polluting ai-sandbox main. Override only if you have a
        // very specific need to redirect monorepo-mode output elsewhere.
        IDLE_SLEEP_SECONDS: '30',       // Sleep when no work (polling interval)
        UNHEALTHY_SLEEP_SECONDS: '60',  // Sleep when system unhealthy
        MAX_TURNS_PER_STEP: '200',      // Default max turns per worker (higher for complex tasks)
        MODEL: 'claude-sonnet-4-5',
        KIMI_MODEL: 'kimi-code/kimi-for-coding',
      },
      env_development: {
        NODE_ENV: 'development',
        // AGENT_OUTPUTS_PATH intentionally NOT set — see env block above.
        IDLE_SLEEP_SECONDS: '60',       // Longer polling in dev
        UNHEALTHY_SLEEP_SECONDS: '60',
        MAX_TURNS_PER_STEP: '200',      // Default max turns per worker
        MODEL: 'claude-sonnet-4-5',
        KIMI_MODEL: 'kimi-code/kimi-for-coding',
      },

      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,

      // Exponential backoff on restarts
      exp_backoff_restart_delay: 1000,

      // Logging
      log_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-combined.log',
      error_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-error.log',
      out_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true,

      // Resource limits
      max_memory_restart: '1G',

      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,

      // Health monitoring
      instances: 1,
      exec_mode: 'fork',
    },

    {
      // V3.0 second-brain daily snapshot (disaster-recovery backup of mem0).
      // Runs once at 04:00 daily via cron, then exits (autorestart: false).
      // snapshot.ts self-loads .env.executive and no-ops if V3_MEMORY_ENABLED
      // is false. Uses paginated search (getAll is broken in v3). This entry is
      // inert until `pm2 start ecosystem.config.cjs` picks it up — adding it
      // here does not activate it until the user (re)starts PM2.
      name: 'memory-snapshot',
      script: 'node_modules/.bin/tsx',
      args: '.claude/skills/memory-snapshot/references/snapshot.ts',
      interpreter: 'none',
      cwd: '/Users/jackjin/dev/continuous-agent',
      cron_restart: '0 4 * * *',
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'development' },
      out_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-snapshot-out.log',
      error_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-snapshot-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true,
    },
  ],

  // Deployment configuration (optional, for remote deployments)
  deploy: {
    production: {
      user: 'agent',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:user/continuous-agent.git',
      path: '/Users/jackjin/dev/continuous-agent',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
    },
  },
};
