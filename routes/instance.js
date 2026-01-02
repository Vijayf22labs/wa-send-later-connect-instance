const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');

// GET /api/stats/instance?instance_id=xxx OR ?mobile_number=xxx
router.get('/instance', async (req, res) => {
  try {
    const { instance_id, mobile_number } = req.query;

    // Validate input - either instance_id or mobile_number must be provided
    if (!instance_id && !mobile_number) {
      return res.status(400).json({
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
        error: 'User not found in database'
      });
    }

    const mongoStatus = user.status;

    // Step 2: Call CODECHT API to fetch instances
    const instancesResponse = await axios.get(
      `${process.env.CODECHAT_URL}/instance/fetchInstances?instanceName=${finalInstanceId}`,
      {
        headers: {
          'apiKey': process.env.API_KEY
        }
      }
    );

    if (!instancesResponse.data || instancesResponse.data.length === 0) {
      return res.status(404).json({
        error: 'Instance not found in CODECHT API'
      });
    }

    const instanceData = instancesResponse.data[0];
    const connectionStatus = instanceData.connectionStatus;
    const token = instanceData.Auth?.token;

    let baileyStatus = null;

    // Step 3: If connection status is ONLINE, call the detailed instance endpoint
    if (connectionStatus === 'ONLINE' && token) {
      try {
        const detailedResponse = await axios.get(
          `${process.env.CODECHAT_URL}/instance/fetchInstance/${finalInstanceId}`,
          {
            headers: {
              'apiKey': process.env.API_KEY,
              'Authorization': `Bearer ${token}`
            }
          }
        );

        baileyStatus = detailedResponse.data.Whatsapp?.connection?.state || null;
      } catch (error) {
        console.error('Error fetching detailed instance data:', error.message);
        // Continue with the response even if this call fails
      }
    }

    // Step 4: Return formatted response
    const response = {
      mobile_number: mobileNumber,
      instance_id: finalInstanceId,
      MongoDB_Status: mongoStatus,
      Codechat_Status: connectionStatus,
      Bailey_Status: baileyStatus
    };

    res.json(response);

  } catch (error) {
    console.error('Error in instance stats endpoint:', error);
    
    if (error.response) {
      // Axios error with response
      return res.status(error.response.status).json({
        error: 'External API error',
        message: error.response.data?.message || error.message
      });
    } else if (error.request) {
      // Axios error without response
      return res.status(503).json({
        error: 'External service unavailable',
        message: 'Unable to connect to CODECHT API'
      });
    } else {
      // Other errors
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
});

router.get('/all-instances', async (req, res) => {
  try {
    const instancesResponse = await axios.get(
      `${process.env.CODECHAT_URL}/instance/fetchInstances`,
      {
        headers: {
          'accept': 'application/json',
          'apiKey': process.env.API_KEY
        }
      }
    );

    if (!instancesResponse.data || instancesResponse.data.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No instances found',
        instances: [],
        statistics: {
          totalInstances: 0,
          onlineInstances: 0,
          offlineInstances: 0,
          totalUsers: 0,
          usersWithInstances: 0
        },
        timestamp: new Date().toISOString()
      });
    }

    const codechatInstances = Array.isArray(instancesResponse.data) 
      ? instancesResponse.data 
      : [instancesResponse.data];

    const mongoUsers = await User.find({}).select('instance_id mobile_number status name email').lean();

    const userMap = new Map();
    mongoUsers.forEach(user => {
      if (user.instance_id) {
        userMap.set(user.instance_id, user);
      }
    });

    const instancesWithStats = [];
    let onlineCount = 0;
    let offlineCount = 0;

    for (const instance of codechatInstances) {
      const instanceId = instance.name || instance.id;
      const connectionStatus = instance.connectionStatus;
      const token = instance.Auth?.token;
      const mongoUser = userMap.get(instanceId);

      let baileyStatus = null;
      let whatsappDetails = null;

      if (connectionStatus === 'ONLINE' && token) {
        try {
          const detailedResponse = await axios.get(
            `${process.env.CODECHAT_URL}/instance/fetchInstance/${instanceId}`,
            {
              headers: {
                'accept': 'application/json',
                'apiKey': process.env.API_KEY,
                'Authorization': `Bearer ${token}`
              }
            }
          );

          baileyStatus = detailedResponse.data.Whatsapp?.connection?.state || null;
          whatsappDetails = {
            state: baileyStatus,
            isConnected: baileyStatus === 'open',
            qrCode: detailedResponse.data.qr || null
          };
        } catch (error) {
          console.error(`Error fetching detailed data for instance ${instanceId}:`, error.message);
        }
      }

      if (connectionStatus === 'ONLINE') {
        onlineCount++;
      } else {
        offlineCount++;
      }

      const instanceStats = {
        instance_id: instanceId,
        instance_name: instance.name,
        mobile_number: mongoUser?.mobile_number || null,
        user_name: mongoUser?.name || null,
        user_email: mongoUser?.email || null,
        MongoDB_Status: mongoUser?.status || 'NOT_FOUND',
        Codechat_Status: connectionStatus,
        Bailey_Status: baileyStatus,
        WhatsApp_Details: whatsappDetails,
        hasMongoRecord: !!mongoUser,
        lastUpdated: new Date().toISOString()
      };

      instancesWithStats.push(instanceStats);
    }

    const statistics = {
      totalInstances: codechatInstances.length,
      onlineInstances: onlineCount,
      offlineInstances: offlineCount,
      totalUsers: mongoUsers.length,
      usersWithInstances: Array.from(userMap.keys()).length,
      instancesWithMongoRecord: instancesWithStats.filter(i => i.hasMongoRecord).length,
      instancesWithoutMongoRecord: instancesWithStats.filter(i => !i.hasMongoRecord).length,
      connectedWhatsApp: instancesWithStats.filter(i => i.Bailey_Status === 'open').length,
      disconnectedWhatsApp: instancesWithStats.filter(i => i.Bailey_Status === 'close').length
    };

    res.status(200).json({
      success: true,
      message: 'All instances fetched successfully',
      instances: instancesWithStats,
      statistics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in all-instances endpoint:', error);
    
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

module.exports = router;
