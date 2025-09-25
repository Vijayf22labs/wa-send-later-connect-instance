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
              'apiKey': process.env.CODECHAT_URL,
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

module.exports = router;
