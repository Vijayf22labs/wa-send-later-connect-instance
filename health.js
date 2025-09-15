const axios = require('axios');
require('dotenv').config();

class HealthChecker {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            checks: []
        };
    }

    // Add a health check result
    addCheck(name, status, message, details = {}) {
        this.results.checks.push({
            name,
            status, // 'healthy', 'unhealthy', 'warning'
            message,
            details,
            timestamp: new Date().toISOString()
        });
    }

    // Check if WhatsApp Instance Monitor API is running
    async checkInstanceMonitorAPI() {
        try {
            console.log('🔍 Checking WhatsApp Instance Monitor API...');
            const response = await axios.get(`http://localhost:${process.env.PORT || 3000}/health`, {
                timeout: 5000
            });
            
            if (response.status === 200) {
                this.addCheck(
                    'WhatsApp Instance Monitor API',
                    'healthy',
                    'API is responding correctly',
                    { 
                        port: process.env.PORT || 3000,
                        responseTime: response.headers['x-response-time'] || 'N/A',
                        status: response.data.status
                    }
                );
                console.log('✅ WhatsApp Instance Monitor API is healthy');
            } else {
                this.addCheck(
                    'WhatsApp Instance Monitor API',
                    'unhealthy',
                    `API returned status ${response.status}`,
                    { port: process.env.PORT || 3000 }
                );
                console.log('❌ WhatsApp Instance Monitor API returned unexpected status');
            }
        } catch (error) {
            this.addCheck(
                'WhatsApp Instance Monitor API',
                'unhealthy',
                'API is not accessible',
                { 
                    error: error.message,
                    port: process.env.PORT || 3000
                }
            );
            console.log('❌ WhatsApp Instance Monitor API is not accessible');
        }
    }

    // Check CodeChat API connectivity
    async checkCodeChatAPI() {
        if (!process.env.CODECHAT_URL || !process.env.API_KEY) {
            this.addCheck(
                'CodeChat API',
                'warning',
                'CodeChat credentials not configured',
                { missing: !process.env.CODECHAT_URL ? 'CODECHAT_URL' : 'API_KEY' }
            );
            console.log('⚠️ CodeChat API credentials not configured');
            return;
        }

        try {
            console.log('🔍 Checking CodeChat API connectivity...');
            const response = await axios.get(`${process.env.CODECHAT_URL}/instance/fetchInstances`, {
                headers: {
                    'accept': 'application/json',
                    'apikey': process.env.API_KEY
                },
                timeout: 10000
            });
            
            if (response.status === 200) {
                const instances = Array.isArray(response.data) ? response.data : [response.data];
                this.addCheck(
                    'CodeChat API',
                    'healthy',
                    'CodeChat API is accessible',
                    { 
                        instanceCount: instances.length,
                        url: process.env.CODECHAT_URL
                    }
                );
                console.log(`✅ CodeChat API is healthy (${instances.length} instances found)`);
            } else {
                this.addCheck(
                    'CodeChat API',
                    'unhealthy',
                    `CodeChat API returned status ${response.status}`,
                    { url: process.env.CODECHAT_URL }
                );
                console.log('❌ CodeChat API returned unexpected status');
            }
        } catch (error) {
            this.addCheck(
                'CodeChat API',
                'unhealthy',
                'CodeChat API is not accessible',
                { 
                    error: error.message,
                    url: process.env.CODECHAT_URL
                }
            );
            console.log('❌ CodeChat API is not accessible');
        }
    }

    // Check F22 Labs credentials
    async checkF22LabsConfig() {
        const requiredVars = ['F22_LOGIN_URL', 'F22_EMAIL', 'F22_PASSWORD', 'F22_API_URL'];
        const missingVars = requiredVars.filter(varName => !process.env[varName]);

        if (missingVars.length === 0) {
            this.addCheck(
                'F22 Labs Configuration',
                'healthy',
                'All F22 Labs environment variables are configured',
                { configuredVars: requiredVars }
            );
            console.log('✅ F22 Labs configuration is complete');
        } else {
            this.addCheck(
                'F22 Labs Configuration',
                'warning',
                'Some F22 Labs environment variables are missing',
                { 
                    missingVars,
                    configuredVars: requiredVars.filter(v => !missingVars.includes(v))
                }
            );
            console.log(`⚠️ F22 Labs configuration incomplete (missing: ${missingVars.join(', ')})`);
        }
    }

    // Check system resources
    async checkSystemResources() {
        try {
            console.log('🔍 Checking system resources...');
            const usage = process.memoryUsage();
            const uptime = process.uptime();
            
            // Convert bytes to MB
            const memoryMB = {
                rss: Math.round(usage.rss / 1024 / 1024),
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
                external: Math.round(usage.external / 1024 / 1024)
            };

            // Check if memory usage is concerning (>500MB)
            const highMemoryUsage = memoryMB.rss > 500;
            
            this.addCheck(
                'System Resources',
                highMemoryUsage ? 'warning' : 'healthy',
                highMemoryUsage ? 'High memory usage detected' : 'System resources are normal',
                {
                    memory: memoryMB,
                    uptimeSeconds: Math.round(uptime),
                    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
                    nodeVersion: process.version,
                    platform: process.platform
                }
            );
            
            console.log(`✅ System resources checked (Memory: ${memoryMB.rss}MB, Uptime: ${Math.floor(uptime / 60)}m)`);
        } catch (error) {
            this.addCheck(
                'System Resources',
                'unhealthy',
                'Failed to check system resources',
                { error: error.message }
            );
            console.log('❌ Failed to check system resources');
        }
    }

    // Check environment configuration
    async checkEnvironmentConfig() {
        console.log('🔍 Checking environment configuration...');
        
        const requiredVars = ['PORT', 'CODECHAT_URL', 'API_KEY'];
        const configuredVars = requiredVars.filter(varName => process.env[varName]);
        const missingVars = requiredVars.filter(varName => !process.env[varName]);

        if (missingVars.length === 0) {
            this.addCheck(
                'Environment Configuration',
                'healthy',
                'All required environment variables are configured',
                { 
                    configuredVars,
                    nodeEnv: process.env.NODE_ENV || 'not set'
                }
            );
            console.log('✅ Environment configuration is complete');
        } else {
            this.addCheck(
                'Environment Configuration',
                'unhealthy',
                'Required environment variables are missing',
                { 
                    missingVars,
                    configuredVars,
                    nodeEnv: process.env.NODE_ENV || 'not set'
                }
            );
            console.log(`❌ Environment configuration incomplete (missing: ${missingVars.join(', ')})`);
        }
    }

    // Calculate overall health status
    calculateOverallHealth() {
        const statuses = this.results.checks.map(check => check.status);
        
        if (statuses.includes('unhealthy')) {
            this.results.overall = 'unhealthy';
        } else if (statuses.includes('warning')) {
            this.results.overall = 'warning';
        } else if (statuses.every(status => status === 'healthy')) {
            this.results.overall = 'healthy';
        } else {
            this.results.overall = 'unknown';
        }
    }

    // Run all health checks
    async runAllChecks() {
        console.log('🏥 Starting comprehensive health check...\n');
        
        await this.checkEnvironmentConfig();
        await this.checkSystemResources();
        await this.checkInstanceMonitorAPI();
        await this.checkCodeChatAPI();
        await this.checkF22LabsConfig();
        
        this.calculateOverallHealth();
        
        console.log('\n📊 Health Check Summary:');
        console.log('=' .repeat(50));
        
        // Display results
        this.results.checks.forEach(check => {
            const emoji = check.status === 'healthy' ? '✅' : 
                         check.status === 'warning' ? '⚠️' : '❌';
            console.log(`${emoji} ${check.name}: ${check.message}`);
        });
        
        console.log('=' .repeat(50));
        const overallEmoji = this.results.overall === 'healthy' ? '✅' : 
                            this.results.overall === 'warning' ? '⚠️' : '❌';
        console.log(`${overallEmoji} Overall Health: ${this.results.overall.toUpperCase()}`);
        console.log(`🕐 Completed at: ${this.results.timestamp}\n`);
        
        return this.results;
    }

    // Get results in JSON format
    getResults() {
        return this.results;
    }
}

// Export for use as module
async function runHealthCheck() {
    const healthChecker = new HealthChecker();
    return await healthChecker.runAllChecks();
}

// Handle command line execution
if (require.main === module) {
    runHealthCheck()
        .then((results) => {
            // Exit with appropriate code
            const exitCode = results.overall === 'healthy' ? 0 : 
                            results.overall === 'warning' ? 1 : 2;
            process.exit(exitCode);
        })
        .catch((error) => {
            console.error('💥 Health check failed:', error.message);
            process.exit(3);
        });
}

module.exports = { runHealthCheck, HealthChecker };
