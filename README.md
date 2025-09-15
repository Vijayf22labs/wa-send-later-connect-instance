# WhatsApp Instance Monitor API

A comprehensive API service for monitoring and managing WhatsApp instances with automatic reconnection functionality. This service integrates with CodeChat API to ensure your WhatsApp instances stay connected and automatically recovers from connection drops.

## Features

- 🔄 **Automatic Monitoring**: Checks all instances every 45 minutes
- 🚀 **Auto-Reconnection**: Automatically reconnects dropped instances
- 📊 **Comprehensive Statistics**: Detailed connection stats and monitoring data
- 🌐 **RESTful API**: Full REST API with comprehensive endpoints
- 📚 **Swagger Documentation**: Interactive API documentation
- ⚡ **Real-time Status**: Live monitoring and status checking

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm
- CodeChat API access

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   # WhatsApp Instance Monitor Configuration
   PORT=3000
   CODECHAT_URL=your_codechat_api_url
   API_KEY=your_codechat_api_key
   
   # F22 Labs Automation Configuration (for restart-app script)
   F22_LOGIN_URL=https://f22labs.cloud/
   F22_EMAIL=your_email@example.com
   F22_PASSWORD=your_password
   F22_API_URL=https://f22labs.cloud/projects/wa-send-later-stage/app/api
   
   # WhatsApp API Health Monitor Configuration
   HEALTH_CHECK_URL=https://wa-send-later-stage-api.leiusn.easypanel.host/health
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
   DEPLOYMENT_URL=http://148.113.8.238:3000/api/deploy/de4ea9fcbbf6cc9b81924966897f00bb0c993f857caa6525
   ENV=dev
   ```

4. Start the application:
   ```bash
   # Recommended: Start both server and health monitor
   npm run all
   
   # Or start server only
   npm start
   ```

## API Documentation

### Interactive Documentation
Visit `http://localhost:3000/api-docs` for complete interactive Swagger documentation.

### Quick API Reference

#### System Endpoints
- **GET /** - API root with endpoint overview
- **GET /health** - Health check endpoint
- **GET /api-docs** - Swagger documentation

#### Monitoring
- **GET /check-instances** - Check all instances
- **GET /check-individual-instance/{instanceId}** - Check specific instance

## API Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "message": "Operation description",
  "data": { /* Response data */ },
  "timestamp": "2025-09-15T12:00:00.000Z"
}
```

Error responses include additional error information:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message",
  "timestamp": "2025-09-15T12:00:00.000Z"
}
```

## Monitoring Features

### Automatic Monitoring
- Runs every 45 minutes via cron job
- Checks all online instances for connectivity
- Automatically attempts reconnection for closed connections
- Provides detailed statistics and logging

### Manual Monitoring
- Trigger checks via API endpoints
- Check specific instances individually
- Get real-time status and statistics

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | Yes |
| `CODECHAT_URL` | CodeChat API base URL | Yes |
| `API_KEY` | CodeChat API key | Yes |
| `NODE_ENV` | Environment (development/production) | No |

## Example Usage

### Check All Instances
```bash
curl http://localhost:3000/check-instances
```

### Check Specific Instance
```bash
curl http://localhost:3000/check-individual-instance/YOUR_INSTANCE_ID
```

## F22 Labs App Restart Automation

This project includes an automated script to restart your F22 Labs cloud application using Puppeteer browser automation.

### Setup
1. Configure the F22 Labs environment variables in your `.env` file:
   ```bash
   F22_LOGIN_URL=https://f22labs.cloud/
   F22_EMAIL=your_email@example.com
   F22_PASSWORD=your_password
   F22_API_URL=https://f22labs.cloud/projects/wa-send-later-stage/app/api
   ```

### Usage
Run the automation script:
```bash
npm run restart-app
```

The script will:
1. 🚀 Launch a browser
2. 📍 Navigate to F22 Labs login page
3. 📧 Enter your email and password
4. 🔄 Click the login button
5. 📍 Navigate to your project's API page
6. 🔄 Click the restart button
7. ✅ Confirm the restart action

### Features
- 🎯 **Automated Login** - Handles the complete login flow
- 🔄 **App Restart** - Automatically clicks the restart button
- 📸 **Error Screenshots** - Takes screenshots on failure for debugging
- 📋 **Detailed Logging** - Provides step-by-step progress updates
- 🔒 **Secure** - Uses environment variables for credentials

### Troubleshooting
- If the script fails, check the generated `error-screenshot.png` for visual debugging
- Ensure all environment variables are correctly set
- Make sure your F22 Labs credentials are valid
- Check that the page selectors haven't changed

## Health Check System

The project includes a comprehensive health check system that monitors all critical components of your WhatsApp Instance Monitor.

### Usage
Run the health check:
```bash
npm run health
```

### What it checks:
- 🔧 **Environment Configuration** - Validates all required environment variables
- 💾 **System Resources** - Monitors memory usage and system uptime
- 🌐 **WhatsApp Instance Monitor API** - Checks if your local API is running
- 📡 **CodeChat API** - Tests connectivity to the external CodeChat service
- ⚙️ **F22 Labs Configuration** - Verifies automation script settings

### Health Status Indicators:
- ✅ **Healthy** - Everything is working correctly
- ⚠️ **Warning** - Minor issues that don't affect core functionality
- ❌ **Unhealthy** - Critical issues that need immediate attention

### Exit Codes:
- `0` - All systems healthy
- `1` - Warnings detected
- `2` - Unhealthy systems detected
- `3` - Health check failed to run

### Example Output:
```
🏥 Starting comprehensive health check...

✅ Environment Configuration: All required environment variables are configured
✅ System Resources: System resources are normal
✅ WhatsApp Instance Monitor API: API is responding correctly
✅ CodeChat API: CodeChat API is accessible (5 instances found)
⚠️ F22 Labs Configuration: Some F22 Labs environment variables are missing

==================================================
✅ Environment Configuration: All required environment variables are configured
✅ System Resources: System resources are normal
✅ WhatsApp Instance Monitor API: API is responding correctly
✅ CodeChat API: CodeChat API is accessible
⚠️ F22 Labs Configuration: Some F22 Labs environment variables are missing
==================================================
⚠️ Overall Health: WARNING
🕐 Completed at: 2025-09-15T12:00:00.000Z
```

## Continuous Health Monitoring

The project includes a continuous health monitoring system that watches your WhatsApp API endpoint 24/7 and automatically handles failures.

### Setup
1. Configure the health monitoring environment variables in your `.env` file:
   ```bash
   HEALTH_CHECK_URL=https://wa-send-later-stage-api.leiusn.easypanel.host/health
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
   DEPLOYMENT_URL=http://148.113.8.238:3000/api/deploy/YOUR_DEPLOYMENT_KEY
   ENV=dev
   ```

### Usage
Start continuous monitoring:
```bash
npm run monitor
```

### How it works:
1. 🔍 **Checks API health every 30 seconds**
2. 🚨 **First failure triggers immediate restart automation**
3. 📢 **Sends Slack alerts with restart notification**
4. ⏳ **Waits 1 minute for recovery after restart**
5. 🚨 **Sends manual intervention alert after 3 failures**

### Features:
- 🎯 **Automatic Recovery** - Triggers F22 Labs app restart on failures
- 📢 **Slack Notifications** - Real-time alerts to your team
- 🛡️ **Smart Cooldowns** - Prevents restart spam (5-minute cooldown)
- 📊 **Failure Tracking** - Counts consecutive failures
- 🔄 **Recovery Detection** - Confirms when service is back online
- 🚨 **Escalation** - Manual intervention alerts for persistent issues

### Notification Types:
- 🚨 **Failure Alert** - API health check failed
- 🔄 **Recovery Attempt** - Automatic restart triggered
- ✅ **Recovery Success** - Service is back online
- ❌ **Recovery Failed** - Manual intervention required
- 🚀 **Monitor Started** - Health monitoring activated
- 🛑 **Monitor Stopped** - Health monitoring deactivated

### Exit Codes:
- **Ctrl+C** - Graceful shutdown with Slack notification
- **SIGTERM** - Clean process termination

## Development

### Scripts

#### Individual Scripts:
- `npm start` - Start the server only
- `npm run dev` - Start with nodemon for development
- `npm run monitor` - Start continuous health monitoring only
- `npm run health` - Run one-time comprehensive health check
- `npm run restart-app` - Run F22 Labs app restart automation

#### Combined Scripts (Recommended):
- `npm run all` - **Start server + health monitor** (with colored output)
- `npm run start-with-monitor` - Start server + health monitor
- `npm run dev-with-monitor` - Start dev server + health monitor

### Architecture
- **Express.js** - Web framework
- **Swagger** - API documentation
- **Axios** - HTTP client for CodeChat API
- **node-cron** - Task scheduling
- **Puppeteer** - Browser automation for F22 Labs integration
- **dotenv** - Environment variable management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License

## Support

For support and questions:
- Check the interactive API documentation at `/api-docs`
- Review the health endpoint at `/health`
- Check server logs for detailed information
