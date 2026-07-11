module.exports = {
  apps: [
    {
      name: "livepdf-docker-stack",
      script: "docker",
      args: "compose -f docker-compose.prod.yml up",
      exec_mode: "fork",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 5,
      restart_delay: 10000, // 10 seconds delay before restart retry
    }
  ]
};
