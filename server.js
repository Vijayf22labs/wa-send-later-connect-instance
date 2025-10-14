const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');
const connectDb = require('./config/connectDb')
const statsRouter = require('./routes/instance')
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
                    'apikey': API_KEY
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
                'apikey': API_KEY
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
                    reconnected: 0
                }
            };
        }
        
        // Statistics tracking
        let openCount = 0;
        let closedCount = 0;
        let reconnectedCount = 0;
        
        // Check each online instance
        for (let i = 0; i < onlineInstances.length; i++) {
            const instance = onlineInstances[i];
            const { name, Auth } = instance;
            const token = Auth.token;
            
            try {
                // Fetch instance details to check WhatsApp connection state
                const instanceDetails = await fetchInstanceDetails(name, token);
                
                // Check if WhatsApp connection state is closed
                if (instanceDetails.Whatsapp && 
                    instanceDetails.Whatsapp.connection && 
                    instanceDetails.Whatsapp.connection.state === 'close') {
                    
                    console.log(`Instance ${name} has closed WhatsApp connection. Attempting to reconnect...`);
                    
                    // Attempt to reconnect
                    await connectInstance(name, token);
                    closedCount++;
                    reconnectedCount++;
                    
                } else {
                    console.log(`Instance ${name} is properly connected (state: ${instanceDetails.Whatsapp?.connection?.state || 'unknown'})`);
                    openCount++;
                }
                
            } catch (error) {
                console.error(`Failed to process instance ${name}:`, error.message);
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
        
        // Return statistics for API responses
        return {
            success: true,
            message: 'Instance check completed',
            statistics: {
                totalInstances: instances.length,
                onlineInstances: onlineInstances.length,
                openConnections: openCount,
                closedConnections: closedCount,
                reconnected: reconnectedCount
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
                reconnected: 0
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
                await connectInstance(name, token);
                response.message = 'Instance was disconnected and has been reconnected';
                response.instance.needsReconnection = true;
                response.instance.reconnected = true;
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
