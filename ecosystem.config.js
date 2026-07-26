module.exports = {
  apps: [
    {
      name: 'travel-notes',
      cwd: '/home/code/Travel-Notes',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PROJECT_ROOT: '/home/code/Travel-Notes',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/home/code/Travel-Notes/logs/pm2-error.log',
      out_file: '/home/code/Travel-Notes/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
