# Twitch Events

This package manages Twitch EventSub subscriptions and forwards events to relevant services.

## Features

- Subscribes to various Twitch events using the EventSub API
- Forwards events to appropriate services
- Handles authorization grants and revocations
- Provides a robust health monitoring system for subscriptions

## Subscription Health Check System

We've implemented a comprehensive health check system to ensure all Twitch EventSub subscriptions remain active, particularly the critical `stream.online` event.

### How It Works

The health check system:

1. Scans all user accounts in the database
2. Verifies that each user has all required EventSub subscriptions
3. Prioritizes critical subscriptions like `stream.online`
4. Automatically fixes any missing subscriptions
5. Provides detailed reporting on issues found and fixed

### Running the Health Check

You can run the health check manually:

```bash
# Navigate to the package directory
cd packages/twitch-events

# Run the health check
bun run subscription-health-check
```

### Automated Monitoring

The health check runs automatically every day at 3:00 AM UTC via GitHub Actions. This ensures that any missing subscriptions are promptly detected and fixed.

If the health check discovers and fixes issues, it will exit with status code 1, triggering a notification in the monitoring system.

### Critical Subscriptions

The following subscriptions are considered critical and are prioritized during health checks:

- `stream.online` - Essential for detecting when a streamer goes live
- `stream.offline` - Important for tracking when a stream ends
- `user.update` - Tracks important user profile changes

### Troubleshooting

If you're encountering issues with Twitch events not being received:

1. Run the health check manually to identify and fix missing subscriptions
2. Check the logs for any authorization errors that might indicate revoked permissions
3. Verify that the user has authorized the required scopes

## Development

```bash
# Start the service in development mode
bun run docker:development

# Build the production bundle
bun run build

# Start the service in production mode
bun run docker:production
```
