# Steps:

1. Set to "isInMaintenanceMode": true
1. Turn dotabod backend off
1. Update backend & frontend environment variables
1. Run `bun just-prod backup`
1. Run `bun just restore`
1. Update all environment variables in Coolify
1. Start the coolify instances

# Environment Variables

Frontend:

- DIRECT_URL

Backend:

- DATABASE_URL
- DB_SECRET
- DB_URL
