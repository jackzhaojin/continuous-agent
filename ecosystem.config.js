// PM2 Ecosystem Configuration
// Per PRD: Executive loop runs continuously via PM2
// Start: pm2 start ecosystem.config.js
// Monitor: pm2 monit
// Logs: pm2 logs executive-loop

module.exports = {
  apps: [
    {
      // Main executive loop process
      name: 'executive-loop',
      script: 'dist/executive-loop.js',
      cwd: '/Users/jackjin/dev/continuous-agent',

      // Environment
      node_args: '--experimental-specifier-resolution=node',
      env: {
        NODE_ENV: 'production',
        AGENT_OUTPUTS_PATH: '/Users/jackjin/dev/agent-outputs',
        LOOP_SLEEP_SECONDS: '30',
        MODEL: 'claude-sonnet-4-5-20250929',
      },
      env_development: {
        NODE_ENV: 'development',
        AGENT_OUTPUTS_PATH: '/Users/jackjin/dev/agent-outputs',
        LOOP_SLEEP_SECONDS: '60',
        MODEL: 'claude-sonnet-4-5-20250929',
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
