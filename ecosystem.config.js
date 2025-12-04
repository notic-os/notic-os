module.exports = {
  apps: [
    {
      name: "ticket-prod",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "ticket-staging",
      script: "server.js",
      env: {
        NODE_ENV: "staging",
        PORT: 3001
      }
    }
  ]
};
