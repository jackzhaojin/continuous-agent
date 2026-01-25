// PM2 Ecosystem Configuration
// Per PRD: Executive loop runs continuously via PM2

module.exports = {
  apps: [
    {
      name: 'executive-loop',
      script: 'dist/executive-loop.js',
      cwd: '/Users/jackjin/dev/continuous-agent',

      // Environment
      node_args: '--experimental-specifier-resolution=node',
      env: {
        NODE_ENV: 'production',
        AGENT_OUTPUTS_PATH: '/Users/jackjin/dev/agent-outputs',
      },

      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,

      // Logging
      log_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-combined.log',
      error_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-error.log',
      out_file: '/Users/jackjin/dev/continuous-agent/ledgers/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Resource limits
      max_memory_restart: '1G',

      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
