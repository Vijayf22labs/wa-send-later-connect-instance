const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');
const connectDb = require('./config/connectDb')
const statsRouter = require('./routes/instance')
const User = require('./models/User')
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const CODECHAT_URL = process.env.CODECHAT_URL;
const API_KEY = process.env.API_KEY;
const DELAY_MS = parseInt(process.env.DELAY_MS);

// Utility function to add delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'WhatsApp Instance Monitor API',
            version: '1.0.0',
            description: 'API for monitoring and managing WhatsApp instances with automatic reconnection functionality',
            contact: {
                name: 'API Support',
                email: 'support@example.com'
            }
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production' 
                    ? 'https://your-production-domain.com' 
                    : `http://localhost:${process.env.PORT || 3000}`,
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
            }
        ],
        components: {
            schemas: {
                Instance: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Unique instance identifier' },
                        name: { type: 'string', description: 'Instance name' },
                        connectionStatus: { 
                            type: 'string', 
                            enum: ['ONLINE', 'OFFLINE'], 
                            description: 'Instance connection status' 
                        },
                        whatsappState: { 
                            type: 'string', 
                            description: 'WhatsApp connection state' 
                        },
                        Auth: {
                            type: 'object',
                            properties: {
                                token: { type: 'string', description: 'Authentication token' }
                            }
                        }
                    }
                },
                Statistics: {
                    type: 'object',
                    properties: {
                        totalInstances: { type: 'integer', description: 'Total number of instances' },
                        onlineInstances: { type: 'integer', description: 'Number of online instances' },
                        openConnections: { type: 'integer', description: 'Number of open WhatsApp connections' },
                        closedConnections: { type: 'integer', description: 'Number of closed WhatsApp connections' },
                        reconnected: { type: 'integer', description: 'Number of instances reconnected' }
                    }
                },
                ApiResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', description: 'Request success status' },
                        message: { type: 'string', description: 'Response message' },
                        timestamp: { type: 'string', format: 'date-time', description: 'Response timestamp' }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', description: 'Error message' },
                        error: { type: 'string', description: 'Detailed error information' },
                        timestamp: { type: 'string', format: 'date-time' }
                    }
                }
            }
        }
    },
    apis: ['./server.js']
};

const specs = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'WhatsApp Instance Monitor API'
}));

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Root
 *     description: Root endpoint that provides API information and links to documentation
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "WhatsApp Instance Monitor API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 description:
 *                   type: string
 *                   example: "API for monitoring and managing WhatsApp instances"
 *                 documentation:
 *                   type: string
 *                   example: "/api-docs"
 *                 endpoints:
 *                   type: object
 *                   description: Available API endpoints
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.status(200).json({
        name: 'WhatsApp Instance Monitor API',
        version: '1.0.0',
        description: 'API for monitoring and managing WhatsApp instances with automatic reconnection functionality',
        documentation: `${baseUrl}/api-docs`,
        endpoints: {
            monitor: {
                checkAll: 'GET /check-instances',
                checkOne: 'GET /check-individual-instance/{instanceId}'
            },
            system: {
                health: 'GET /health'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// Function to fetch all instances or specific instance
async function fetchInstances(instanceId) {
    try {
        if(instanceId){
            console.log(`Fetching particular instance: ${instanceId}`);
            const response = await axios.get(`${CODECHAT_URL}/instance/fetchInstances?instanceName=${instanceId}`, {
                headers: {
                    'accept': 'application/json',
                    'apiKey': API_KEY
                }
            });

            // Ensure we return an array format for consistency
            const data = response.data;
            return Array.isArray(data) ? data : [data];
        }
        console.log('Fetching instances...');
        const response = await axios.get(`${CODECHAT_URL}/instance/fetchInstances`, {
            headers: {
                'accept': 'application/json',
                'apiKey': API_KEY
            }
        });
        
        console.log(`Found ${response.data.length} instances`);
        return response.data;
    } catch (error) {
        console.error('Error fetching instances:', error.message);
        throw error;
    }
}

// Function to fetch specific instance details
async function fetchInstanceDetails(instanceName, token) {
    try {
        console.log(`Fetching details for instance: ${instanceName}`);
        const response = await axios.get(`${CODECHAT_URL}/instance/fetchInstance/${instanceName}`, {
            headers: {
                'accept': 'application/json',
                'apiKey': API_KEY,
                'Authorization': `Bearer ${token}`
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`Error fetching instance details for ${instanceName}:`, error.message);
        throw error;
    }
}

// Function to connect/reconnect an instance
async function connectInstance(instanceName, token) {
    try {
        console.log(`Connecting instance: ${instanceName}`);
        const response = await axios.get(`${CODECHAT_URL}/instance/connect/${instanceName}`, {
            headers: {
                'accept': 'application/json',
                'apiKey': API_KEY,
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log(`Successfully connected instance: ${instanceName}`);
        return response.data;
    } catch (error) {
        console.error(`Error connecting instance ${instanceName}:`, error.message);
        throw error;
    }
}

// Function to logout an instance
async function logoutInstance(instanceName, token) {
    try {
        console.log(`Logging out instance: ${instanceName}`);
        await axios.delete(`${CODECHAT_URL}/instance/logout/${encodeURIComponent(instanceName)}`, {
            headers: {
                'accept': 'application/json',
                'apiKey': API_KEY,
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log(`Successfully logged out instance: ${instanceName}`);
        return { success: true };
    } catch (error) {
        console.error(`Error logging out instance ${instanceName}:`, error.message);
        throw error;
    }
}

// Function to mark instance offline in MongoDB
async function markInstanceOffline(instanceName) {
    if (!instanceName) return;
    try {
        const updateResult = await User.findOneAndUpdate(
            { instance_id: instanceName },
            { $set: { status: 'OFFLINE' } }
        );

        if (updateResult.matchedCount === 0) {
            console.warn(`No Mongo user found for instance ${instanceName} to mark offline`);
        } else {
            console.log(`Instance ${instanceName} marked OFFLINE in MongoDB (modified: ${updateResult.modifiedCount})`);
        }
        return { success: true, status: updateResult.status };
    } catch (mongoError) {
        console.error(`Failed to mark instance ${instanceName} offline in MongoDB:`, mongoError.message);
    }
}

// Main function to check and reconnect instances
async function checkAndReconnectInstances() {
    try {
        console.log('\n=== Starting instance check at', new Date().toISOString(), '===');
        
        // Fetch all instances
        const instances = await fetchInstances();
        
        // Filter online instances
        const onlineInstances = instances.filter(instance => 
            instance.connectionStatus === 'ONLINE'
        );
        
        console.log(`Found ${onlineInstances.length} online instances`);
        
        if (onlineInstances.length === 0) {
            console.log('No online instances found. Skipping connection check.');
            return {
                success: true,
                message: 'No online instances found',
                statistics: {
                    totalInstances: instances.length,
                    onlineInstances: 0,
                    openConnections: 0,
                    closedConnections: 0,
                    reconnected: 0,
                    loggedOut: 0
                }
            };
        }
        
        // Statistics tracking
        let openCount = 0;
        let closedCount = 0;
        let reconnectedCount = 0;
        let loggedOutCount = 0;
        
        // Check each online instance
        for (let i = 0; i < onlineInstances.length; i++) {
            const instance = onlineInstances[i];
            const { name, Auth } = instance;
            const token = Auth.token;
            
            try {
                // Fetch instance details to check WhatsApp connection state
                const instanceDetails = await fetchInstanceDetails(name, token);
                
                // Get Bailey status
                const baileyStatus = instanceDetails.Whatsapp?.connection?.state || null;
                
                // Check if Bailey status is null
                if (baileyStatus === null) {
                    console.log(`Instance ${name} has Codechat ONLINE but Bailey status is null. Connecting and logging out...`);
                    
                    try {
                        await connectInstance(name, token);
                        await logoutInstance(name, token);
                        await markInstanceOffline(name);
                        
                        console.log(`Instance ${name} has been connected and logged out due to null Bailey status`);
                        loggedOutCount++;
                    } catch (connectLogoutError) {
                        console.error(`Failed to connect/logout instance ${name}:`, connectLogoutError.message);
                    }
                    continue; // Skip to next instance
                }
                
                // Check if WhatsApp connection state is closed
                if (instanceDetails.Whatsapp && 
                    instanceDetails.Whatsapp.connection && 
                    instanceDetails.Whatsapp.connection.state === 'close') {
                    
                    console.log(`Instance ${name} has closed WhatsApp connection. Attempting to reconnect...`);
                    
                    // Attempt to reconnect
                    const connectResponse = await connectInstance(name, token);
                    
                    // Check if response contains base64 field (QR code scenario)
                    if (connectResponse && connectResponse.base64) {
                        console.log(`Instance ${name} connection returned QR code. Logging out instance...`);
                        try {
                            await logoutInstance(name, token);
                            await markInstanceOffline(name);
                            console.log(`Instance ${name} has been logged out due to QR code requirement`);
                        } catch (logoutError) {
                            console.error(`Failed to logout instance ${name}:`, logoutError.message);
                        }
                    }
                    
                    closedCount++;
                    reconnectedCount++;
                    
                } else {
                    console.log(`Instance ${name} is properly connected (state: ${instanceDetails.Whatsapp?.connection?.state || 'unknown'})`);
                    openCount++;
                }
                
            } catch (error) {
                const statusCode = error.response?.status;
                const errorMessage = error.response?.data?.message;
                const normalizedMessages = Array.isArray(errorMessage) ? errorMessage : [errorMessage].filter(Boolean);
                const instanceMissing = statusCode === 400 && normalizedMessages.some(msg => 
                    typeof msg === 'string' && msg.includes('does not exist or is not connected')
                );

                if (instanceMissing || (instance.connectionStatus === 'ONLINE')) {
                    console.log(`Instance ${name} is ONLINE but fetchInstanceDetails failed. Connecting and logging out...`);
                    
                    try {
                        await connectInstance(name, token);
                        await logoutInstance(name, token);
                        await markInstanceOffline(name);
                        
                        console.log(`Instance ${name} has been connected and logged out after fetchInstanceDetails error`);
                        loggedOutCount++;
                    } catch (connectLogoutError) {
                        console.error(`Failed to connect/logout instance ${name} after error:`, connectLogoutError.message);
                    }
                } else {
                    console.error(`Failed to process instance ${name}:`, error.message);
                }
            }
            
            // Add delay between calls (except for the last instance)
            if (i < onlineInstances.length - 1) {
                console.log(`Waiting ${DELAY_MS}ms before checking next instance...`);
                await delay(DELAY_MS);
            }
        }
        
        // Display statistics
        console.log('=== Instance check completed ===');
        console.log(`STATISTICS:`);
        console.log(`Open connections: ${openCount}`);
        console.log(`Closed connections: ${closedCount}`);
        console.log(`Reconnected: ${reconnectedCount}`);
        console.log(`Logged out (null Bailey/errors): ${loggedOutCount}`);
        
        // Return statistics for API responses
        return {
            success: true,
            message: 'Instance check completed',
            statistics: {
                totalInstances: instances.length,
                onlineInstances: onlineInstances.length,
                openConnections: openCount,
                closedConnections: closedCount,
                reconnected: reconnectedCount,
                loggedOut: loggedOutCount
            }
        };
        
    } catch (error) {
        console.error('Error in checkAndReconnectInstances:', error.message);
        return {
            success: false,
            message: 'Error checking instances',
            error: error.message,
            statistics: {
                totalInstances: 0,
                onlineInstances: 0,
                openConnections: 0,
                closedConnections: 0,
                reconnected: 0,
                loggedOut: 0
            }
        };
    }
}

// Schedule cron job to run every 45 minutes (only if CRON_START is true)
if (process.env.CRON_START === 'true') {
    cron.schedule('0 */45 * * * *', () => {
        checkAndReconnectInstances();
    });
} else {
    console.log('Cron job disabled - set CRON_START=true in environment to enable');
}



/**
 * @swagger
 * /check-instances:
 *   get:
 *     summary: Check and reconnect all instances (Legacy endpoint)
 *     description: Manually trigger a check of all instances and reconnect any with closed connections
 *     tags: [Monitor]
 *     responses:
 *       200:
 *         description: Successfully completed instance check
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Instance check completed"
 *                 statistics:
 *                   $ref: '#/components/schemas/Statistics'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/check-instances', async (req, res) => {
    try {
        const result = await checkAndReconnectInstances();
        res.status(200).json({ 
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error checking instances',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /check-individual-instance/{instanceId}:
 *   get:
 *     summary: Check individual instance (Legacy endpoint)
 *     description: Check and potentially reconnect a specific instance
 *     tags: [Monitor]
 *     parameters:
 *       - in: path
 *         name: instanceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Instance ID
 *     responses:
 *       200:
 *         description: Successfully checked instance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 instance:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     connectionStatus:
 *                       type: string
 *                     whatsappState:
 *                       type: string
 *                     needsReconnection:
 *                       type: boolean
 *                     reconnected:
 *                       type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request (instance not online)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Instance not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/check-individual-instance/:instanceId', async (req, res) => {
    try {
        const { instanceId } = req.params;
        
        if (!instanceId) {
            return res.status(400).json({
                success: false,
                message: 'Instance ID is required'
            });
        }

        console.log(`Checking individual instance: ${instanceId}`);

        // Fetch specific instance by ID
        const instance = await fetchInstances(instanceId);
        
        if (!instance || !instance[0]) {
            return res.status(404).json({
                success: false,
                message: `Instance with ID ${instanceId} not found`
            });
        }

        const { name, Auth } = instance[0];
        const token = Auth.token;

        // Check if instance is online
        if (instance[0].connectionStatus !== 'ONLINE') {
            return res.status(400).json({
                success: false,
                message: `Instance ${instanceId} is not online (status: ${instance[0].connectionStatus})`,
                instance: {
                    id: instance[0].id,
                    name: instance[0].name,
                    connectionStatus: instance[0].connectionStatus
                }
            });
        }
        
        // Fetch instance details to check WhatsApp connection state
        const instanceDetails = await fetchInstanceDetails(name, token);

        const response = {
            success: true,
            message: 'Instance check completed',
            instance: {
                id: instance[0].id,
                name: instance[0].name,
                connectionStatus: instance[0].connectionStatus,
                whatsappState: instanceDetails.Whatsapp?.connection?.state || 'unknown',
                needsReconnection: false
            },
            timestamp: new Date().toISOString()
        };
                
        // Check if WhatsApp connection state is closed
        if (instanceDetails.Whatsapp && 
            instanceDetails.Whatsapp.connection && 
            instanceDetails.Whatsapp.connection.state === 'close') {
            
            console.log(`Instance ${name} has closed WhatsApp connection. Attempting to reconnect...`);
            
            try {
                // Attempt to reconnect
                const connectResponse = await connectInstance(name, token);
                
                // Check if response contains base64 field (QR code scenario)
                if (connectResponse && connectResponse.base64) {
                    console.log(`Instance ${name} connection returned QR code. Logging out instance...`);
                    try {
                        await logoutInstance(name, token);
                        response.message = 'Instance was disconnected and logged out due to QR code requirement';
                        response.instance.needsReconnection = true;
                        response.instance.reconnected = false;
                        response.instance.loggedOut = true;
                    } catch (logoutError) {
                        console.error(`Failed to logout instance ${name}:`, logoutError.message);
                        response.message = 'Instance reconnection returned QR code, but logout failed';
                        response.instance.needsReconnection = true;
                        response.instance.reconnected = false;
                        response.error = logoutError.message;
                    }
                } else {
                    response.message = 'Instance was disconnected and has been reconnected';
                    response.instance.needsReconnection = true;
                    response.instance.reconnected = true;
                }
            } catch (reconnectError) {
                console.error(`Failed to reconnect instance ${name}:`, reconnectError.message);
                response.message = 'Instance was disconnected but reconnection failed';
                response.instance.needsReconnection = true;
                response.instance.reconnected = false;
                response.error = reconnectError.message;
            }
        } else {
            response.message = `Instance is properly connected (state: ${instanceDetails.Whatsapp?.connection?.state || 'unknown'})`;
        }

        res.status(200).json(response);

    } catch (error) {
        console.error(`Error checking individual instance ${req.params.instanceId}:`, error.message);
        
        // Handle specific error cases
        if (error.response && error.response.status === 404) {
            return res.status(404).json({
                success: false,
                message: `Instance with ID ${req.params.instanceId} not found`,
                timestamp: new Date().toISOString()
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error checking individual instance',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});


/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check if the WhatsApp Instance Monitor service is running
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 message:
 *                   type: string
 *                   example: "WhatsApp Instance Monitor is running"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'WhatsApp Instance Monitor is running'
    });
});

app.use('/api/stats', statsRouter)

// Logout all users across online instances
app.post('/logout-all-instances', async (req, res) => {
    try {
        // Step 1: Fetch all instances from Codechat API
        const instancesResponse = await fetchInstances();

        if (!instancesResponse.data || instancesResponse.data.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No instances found',
                results: [],
                statistics: {
                    totalInstances: 0,
                    onlineInstances: 0,
                    nullBaileyInstances: 0,
                    processed: 0,
                    success: 0,
                    failed: 0
                },
                timestamp: new Date().toISOString()
            });
        }

        const codechatInstances = Array.isArray(instancesResponse.data) 
            ? instancesResponse.data 
            : [instancesResponse.data];

        // Step 2: Filter ONLINE instances and check Bailey status
        const onlineInstances = codechatInstances.filter(
            instance => instance.connectionStatus === 'ONLINE'
        );

        const instancesToProcess = [];
        const results = [];

        // Step 3: Check Bailey status for each ONLINE instance
        for (const instance of onlineInstances) {
            const instanceId = instance.name || instance.id;
            const token = instance.Auth?.token;

            if (!token) {
                results.push({
                    instance_id: instanceId,
                    status: 'skipped',
                    reason: 'Missing token'
                });
                continue;
            }

            let baileyStatus = null;

            try {
                const detailedResponse = await fetchInstanceDetails(instanceId, token);

                baileyStatus = detailedResponse.data.Whatsapp?.connection?.state || null;
            } catch (error) {
                console.error(`Error fetching Bailey status for ${instanceId}:`, error.message);
            }

            // Step 4: If Bailey status is null, add to processing list
            if (baileyStatus === null) {
                instancesToProcess.push({
                    instanceId,
                    token,
                    instance
                });
            }
        }

        // Step 5: Process each instance: connect then logout
        let successCount = 0;
        let failedCount = 0;

        for (const { instanceId, token } of instancesToProcess) {
            try {
                // Step 5a: Call connect API first
                console.log(`Connecting instance ${instanceId} before logout...`);
                await connectInstance(instanceId, token);

                console.log(`Successfully connected ${instanceId}, now logging out...`);

                // Step 5b: Immediately call logout API
                await logoutInstance(instanceId, token);

                // Step 5c: Mark offline in MongoDB
                try {
                    await markInstanceOffline(instanceId);
                } catch (error) {
                    console.error(`Failed to mark instance ${instanceId} offline:`, error.message);
                }

                results.push({
                    instance_id: instanceId,
                    status: 'success',
                    message: 'Connected and logged out successfully'
                });
                successCount++;

            } catch (error) {
                console.error(`Failed to process instance ${instanceId}:`, error.message);
                results.push({
                    instance_id: instanceId,
                    status: 'failed',
                    error: error.response?.data || error.message
                });
                failedCount++;
            }
        }

        // Step 6: Return comprehensive response
        res.status(200).json({
            success: true,
            message: `Processed ${instancesToProcess.length} instances with null Bailey status`,
            results,
            statistics: {
                totalInstances: codechatInstances.length,
                onlineInstances: onlineInstances.length,
                nullBaileyInstances: instancesToProcess.length,
                processed: instancesToProcess.length,
                success: successCount,
                failed: failedCount
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in logout-null-bailey endpoint:', error);
        
        if (error.response) {
            return res.status(error.response.status || 500).json({
                success: false,
                error: 'External API error',
                message: error.response.data?.message || error.message,
                timestamp: new Date().toISOString()
            });
        } else if (error.request) {
            return res.status(503).json({
                success: false,
                error: 'External service unavailable',
                message: 'Unable to connect to CODECHT API',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// Logout a single user by instance name
app.post('/logout-instance', async (req, res) => {
    try {
        const { instance_id, mobile_number } = req.query;
  
        if (!instance_id && !mobile_number) {
            return res.status(400).json({
                success: false,
                error: 'Either instance_id or mobile_number must be provided'
            });
      }
  
        let user;
        let finalInstanceId;
        let mobileNumber;
    
        // Step 1: Search MongoDB user collection
        if (instance_id) {
            user = await User.findOne({ instance_id });
            finalInstanceId = instance_id;
            mobileNumber = user ? user.mobile_number : null;
        } else {
            user = await User.findOne({ mobile_number });
            finalInstanceId = user ? user.instance_id : null;
            mobileNumber = mobile_number;
        }
  
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found in database'
            });
        }
    
        if (!finalInstanceId) {
            return res.status(400).json({
                success: false,
                error: 'Instance ID not found for this user'
            });
        }
  
        // Step 2: Call CODECHT API to fetch instance
        const instancesResponse = await fetchInstances(finalInstanceId, token);
    
        if (!instancesResponse.data || instancesResponse.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Instance not found in CODECHT API'
            });
        }
  
        const instanceData = instancesResponse.data[0];
        const connectionStatus = instanceData.connectionStatus;
        const token = instanceData.Auth?.token;
    
        // Step 3: Check if instance is ONLINE
        if (connectionStatus !== 'ONLINE') {
            return res.status(400).json({
                success: false,
                error: `Instance is not ONLINE (status: ${connectionStatus})`,
                instance_id: finalInstanceId,
                mobile_number: mobileNumber,
                codechat_status: connectionStatus
            });
        }

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Missing authentication token for the instance',
                instance_id: finalInstanceId,
                mobile_number: mobileNumber
            });
        }
  
        // Step 4: Check Bailey status
        let baileyStatus = null;
        try {
            const detailedResponse = await fetchInstanceDetails(finalInstanceId, token);
            baileyStatus = detailedResponse.data.Whatsapp?.connection?.state || null;
        } catch (error) {
            console.error(`Error fetching Bailey status for ${finalInstanceId}:`, error.message);
        }
    
        // Step 5: Check if Bailey status is null 
        if (baileyStatus !== null) {
            console.log(`Warning: Instance ${finalInstanceId} has Bailey status '${baileyStatus}', but proceeding with logout`);
        }
  
        // Step 6: Call connect API first
        try {
            console.log(`Connecting instance ${finalInstanceId} before logout...`);
            await connectInstance(finalInstanceId, token);
            console.log(`Successfully connected ${finalInstanceId}, now logging out...`);
        } catch (connectError) {
            console.error(`Error connecting instance ${finalInstanceId}:`, connectError.message);
        }
    
        // Step 7: Immediately call logout API
        try {
            await logoutInstance(finalInstanceId, token);
            console.log(`Successfully logged out instance ${finalInstanceId}`);
        } catch (logoutError) {
            console.error(`Error logging out instance ${finalInstanceId}:`, logoutError.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to logout instance',
                message: logoutError.response?.data || logoutError.message,
                instance_id: finalInstanceId,
                mobile_number: mobileNumber,
                timestamp: new Date().toISOString()
            });
        }
  
        // Step 8: Mark offline in MongoDB
        let markOfflineResult = null;
        try {
            const response = await markInstanceOffline(finalInstanceId);
            markOfflineResult = response.status;
            console.log(`Instance ${finalInstanceId} marked OFFLINE in MongoDB`);
        } catch (mongoError) {
            console.error(`Failed to update MongoDB for ${finalInstanceId}:`, mongoError.message);
        }

        res.status(200).json({
            success: true,
            message: 'Instance connected and logged out successfully',
            instance_id: finalInstanceId,
            mobile_number: mobileNumber,
            previous_status: {
                codechat_status: connectionStatus,
                bailey_status: baileyStatus,
                mongo_status: user.status
            },
            current_status: {
                codechat_status: 'OFFLINE',
                mongo_status: markOfflineResult
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in logout-instance endpoint:', error);
      
        if (error.response) {
            return res.status(error.response.status || 500).json({
                success: false,
                error: 'External API error',
                message: error.response.data?.message || error.message,
                timestamp: new Date().toISOString()
            });
        } else if (error.request) {
            return res.status(503).json({
                success: false,
                error: 'External service unavailable',
                message: 'Unable to connect to CODECHT API',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
  });

// Start server
async function startServer(){
    try{
        await connectDb() 
        app.listen(PORT, () => {
            console.log(`WhatsApp Instance Monitor running on port ${PORT}`);
        });
    }
    catch(err){
        console.log(`Error in starting Server - ${err.message}`)
    }
}

startServer()

module.exports = app;
