const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const CODECHAT_URL = process.env.CODECHAT_URL;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(express.json());

// Function to fetch all instances or specific instance
async function fetchInstances(instanceId) {
    try {
        if(instanceId){
            console.log(`Fetching particular instance: ${instanceId}`);
            const response = await axios.get(`${CODECHAT_URL}/instance/fetchInstances/${instanceId}`, {
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
        for (const instance of onlineInstances) {
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

// Schedule cron job to run every 45 minutes
cron.schedule('0 */45 * * * *', () => {
    checkAndReconnectInstances();
});

// Manual trigger endpoint for testing
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'WhatsApp Instance Monitor is running'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`WhatsApp Instance Monitor running on port ${PORT}`);
});

module.exports = app;
