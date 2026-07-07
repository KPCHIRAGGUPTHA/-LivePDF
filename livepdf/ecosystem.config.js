module.exports = {
  apps: [
    {
      name: "livepdf-docker-stack",
      script: "docker-compose",
      args: "-f docker-compose.prod.yml up --build",
      autorestart: true,
      watch: false,
      max_restarts: 5,
      restart_delay: 10000, // 10 seconds delay before restart retry
    }
  ]
};
