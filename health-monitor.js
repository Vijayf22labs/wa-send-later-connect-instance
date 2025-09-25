const axios = require('axios');
const restartF22LabsApp = require('./restart-app.js');
require('dotenv').config();

class HealthMonitor {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.lastStatus = 'unknown';
        this.consecutiveFailures = 0;
        this.restartAttempted = false;
        this.lastRestartTime = null;
        
        // Configuration from environment variables
        this.config = {
            healthUrl: process.env.HEALTH_CHECK_URL,
            slackWebhook: process.env.SLACK_WEBHOOK_URL,
            deploymentUrl: process.env.DEPLOYMENT_URL,
            env: process.env.ENV || 'dev',
            checkInterval: 120000, // 2 minutes
            restartCooldown: 300000, // 5 minutes cooldown between restart attempts
            maxRetries: 2 // Maximum restart attempts before requiring manual intervention
        };

        this.validateConfig();
    }

    validateConfig() {
        const required = ['healthUrl', 'slackWebhook'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(key => {
                const envName = key === 'healthUrl' ? 'HEALTH_CHECK_URL' : 
                               key === 'slackWebhook' ? 'SLACK_WEBHOOK_URL' : key;
                console.error(`   - ${envName}`);
            });
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }

        console.log('✅ Health monitor configuration validated');
        console.log(`🎯 Monitoring: ${this.config.healthUrl}`);
        console.log(`📢 Slack notifications: ${this.config.slackWebhook ? 'Enabled' : 'Disabled'}`);
        console.log(`🔄 Check interval: ${this.config.checkInterval / 1000}s`);
        console.log(`🌍 Environment: ${this.config.env}`);
    }

    async sendSlackMessage(message, color = 'warning') {
        if (!this.config.slackWebhook) {
            console.log('⚠️ Slack webhook not configured, skipping notification');
            return;
        }

        try {
            const payload = {
                attachments: [{
                    color: color,
                    title: `🏥 WhatsApp API Health Monitor - ${this.config.env.toUpperCase()}`,
                    text: message,
                    timestamp: Math.floor(Date.now() / 1000),
                    fields: [
                        {
                            title: 'Environment',
                            value: this.config.env,
                            short: true
                        },
                        {
                            title: 'Health URL',
                            value: this.config.healthUrl,
                            short: true
                        },
                        {
                            title: 'Consecutive Failures',
                            value: this.consecutiveFailures.toString(),
                            short: true
                        },
                        {
                            title: 'Timestamp',
                            value: new Date().toISOString(),
                            short: true
                        }
                    ]
                }]
            };

            await axios.post(this.config.slackWebhook, payload, {
                timeout: 10000
            });
            
            console.log('📢 Slack notification sent successfully');
        } catch (error) {
            console.error('❌ Failed to send Slack notification:', error.message);
        }
    }

    async checkHealth() {
        try {
            // Only log if there are issues, not on every check
            const response = await axios.get(this.config.healthUrl, {
                timeout: 10000,
                validateStatus: (status) => status < 500 // Don't throw on 4xx errors
            });

            if (response.status === 200) {
                // Health check passed - always console log but only Slack on recovery
                console.log(`✅ Health check passed (${response.status})`);
                
                if (this.lastStatus !== 'healthy') {
                    console.log('✅ API is healthy - Service recovered!');
                    
                    if (this.consecutiveFailures > 0) {
                        await this.sendSlackMessage(
                            `✅ *Service Recovered!*\n\nThe WhatsApp API is now responding normally after ${this.consecutiveFailures} consecutive failures.`,
                            'good'
                        );
                    }
                    
                    // Reset failure tracking
                    this.consecutiveFailures = 0;
                    this.restartAttempted = false;
                }
                
                this.lastStatus = 'healthy';
                
            } else {
                // Health check failed
                this.consecutiveFailures++;
                this.lastStatus = 'unhealthy';
                
                console.log(`❌ Health check failed (${response.status}) - Failure #${this.consecutiveFailures}`);
                
                // Send Slack notification for any non-200 response
                await this.sendSlackMessage(
                    `🚨 *API Health Check Failed*\n\nStatus: HTTP ${response.status}\nURL: ${this.config.healthUrl}\nFailure #${this.consecutiveFailures}`,
                    'danger'
                );
                
                await this.handleHealthFailure(response.status, `HTTP ${response.status}`);
            }
            
        } catch (error) {
            // Network or other error
            this.consecutiveFailures++;
            this.lastStatus = 'unhealthy';
            
            console.log(`❌ Health check error - Failure #${this.consecutiveFailures}: ${error.message}`);
            
            // Send Slack notification for network/connection errors
            await this.sendSlackMessage(
                `🚨 *API Health Check Failed*\n\nError: ${error.message}\nURL: ${this.config.healthUrl}\nFailure #${this.consecutiveFailures}`,
                'danger'
            );
            
            await this.handleHealthFailure('ERROR', error.message);
        }
    }

    async handleHealthFailure(status, errorDetails) {
        // Execute restart on first failure (if conditions are met)
        if (this.consecutiveFailures === 1 && !this.restartAttempted && this.canAttemptRestart()) {
            console.log('🔄 Attempting automatic restart via F22 Labs automation...');
            
            await this.sendSlackMessage(
                `🔄 *Attempting Automatic Recovery*\n\nTriggering F22 Labs app restart after ${this.consecutiveFailures} consecutive failures.\n\nWill wait 1 minute for service recovery...`,
                'warning'
            );

            try {
                await restartF22LabsApp();
                this.restartAttempted = true;
                this.lastRestartTime = Date.now();
                
                console.log('✅ Restart automation completed, waiting 1 minute for recovery...');
                
                // Wait 1 minute then check if service recovered
                setTimeout(async () => {
                    await this.checkRecoveryAfterRestart();
                }, 60000);
                
            } catch (error) {
                console.error('❌ Failed to execute restart automation:', error.message);
                
                await this.sendSlackMessage(
                    `❌ *Automatic Restart Failed*\n\nError: ${error.message}\n\n🚨 **Manual intervention required!**`,
                    'danger'
                );
            }
        }

        // Send manual intervention alert after multiple failures
        if (this.consecutiveFailures >= 3 && this.restartAttempted) {
            await this.sendSlackMessage(
                `🚨 *MANUAL INTERVENTION REQUIRED*\n\nService has been down for ${this.consecutiveFailures} consecutive checks.\nAutomatic restart was attempted but service is still failing.\n\n**Please investigate immediately!**`,
                'danger'
            );
        }
    }

    async checkRecoveryAfterRestart() {
        console.log('🔍 Checking if service recovered after restart...');
        
        try {
            const response = await axios.get(this.config.healthUrl, {
                timeout: 10000
            });

            if (response.status === 200) {
                console.log('✅ Service recovered after restart!');
                await this.sendSlackMessage(
                    `✅ *Recovery Successful!*\n\nService is now responding normally after automatic restart.`,
                    'good'
                );
                
                this.consecutiveFailures = 0;
                this.lastStatus = 'healthy';
            } else {
                console.log('❌ Service still not responding after restart');
                await this.sendSlackMessage(
                    `❌ *Recovery Failed*\n\nService is still not responding normally after restart.\n\n🚨 **Manual intervention required!**`,
                    'danger'
                );
            }
        } catch (error) {
            console.log('❌ Service still not accessible after restart');
            await this.sendSlackMessage(
                `❌ *Recovery Failed*\n\nService is still not accessible after restart.\n\nError: ${error.message}\n\n🚨 **Manual intervention required!**`,
                'danger'
            );
        }
    }

    canAttemptRestart() {
        if (!this.lastRestartTime) return true;
        
        const timeSinceLastRestart = Date.now() - this.lastRestartTime;
        return timeSinceLastRestart > this.config.restartCooldown;
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️ Health monitor is already running');
            return;
        }

        console.log('🚀 Starting WhatsApp API Health Monitor...');
        console.log('=' .repeat(50));
        
        this.isRunning = true;
        
        // Initial health check
        this.checkHealth();
        
        // Set up interval for continuous monitoring
        this.intervalId = setInterval(() => {
            this.checkHealth();
        }, this.config.checkInterval);

        console.log(`✅ Health monitor started - checking every ${this.config.checkInterval / 1000} seconds`);
        
        // Don't send startup notification to reduce Slack noise
    }

    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Health monitor is not running');
            return;
        }

        console.log('🛑 Stopping health monitor...');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.isRunning = false;
        console.log('✅ Health monitor stopped');
        
        // Don't send shutdown notification to reduce Slack noise
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastStatus: this.lastStatus,
            consecutiveFailures: this.consecutiveFailures,
            restartAttempted: this.restartAttempted,
            lastRestartTime: this.lastRestartTime,
            config: {
                ...this.config,
                slackWebhook: this.config.slackWebhook ? '[CONFIGURED]' : '[NOT CONFIGURED]'
            }
        };
    }
}

// Handle command line execution
if (require.main === module) {
    const monitor = new HealthMonitor();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received shutdown signal...');
        monitor.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 Received termination signal...');
        monitor.stop();
        process.exit(0);
    });

    // Start monitoring
    try {
        monitor.start();
        
        // Keep the process alive
        process.stdin.resume();
        
    } catch (error) {
        console.error('💥 Failed to start health monitor:', error.message);
        process.exit(1);
    }
}

module.exports = HealthMonitor;
