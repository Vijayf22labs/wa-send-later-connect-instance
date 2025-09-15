const puppeteer = require('puppeteer-core');
require('dotenv').config();

async function restartF22LabsApp() {
    // Validate environment variables
    const requiredEnvVars = {
        F22_LOGIN_URL: process.env.F22_LOGIN_URL,
        F22_EMAIL: process.env.F22_EMAIL,
        F22_PASSWORD: process.env.F22_PASSWORD,
        F22_API_URL: process.env.F22_API_URL
    };

    console.log('🔧 Checking environment variables...');
    const missingVars = [];
    
    for (const [key, value] of Object.entries(requiredEnvVars)) {
        if (!value) {
            missingVars.push(key);
        } else {
            console.log(`✅ ${key}: ${key === 'F22_PASSWORD' ? '***' : value}`);
        }
    }

    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:');
        missingVars.forEach(varName => console.error(`   - ${varName}`));
        console.error('\n💡 Please add these to your .env file:');
        console.error('F22_LOGIN_URL=https://f22labs.cloud/');
        console.error('F22_EMAIL=your_email@example.com');
        console.error('F22_PASSWORD=your_password');
        console.error('F22_API_URL=https://f22labs.cloud/projects/wa-send-later-stage/app/api');
        throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    const browser = await puppeteer.launch({ 
        headless: false, // Set to true for production
        defaultViewport: null,
        executablePath: '/usr/bin/chromium',
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
    });

    let page;
    try {
        page = await browser.newPage();
        
        console.log('🚀 Starting F22 Labs app restart automation...');
        
        // Navigate to login page
        console.log('📍 Navigating to F22 Labs login page...');
        await page.goto(requiredEnvVars.F22_LOGIN_URL, { waitUntil: 'networkidle2' });
        
        // Wait for login form to load
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        
        // Fill in email
        console.log('📧 Entering email...');
        await page.type('input[name="email"]', requiredEnvVars.F22_EMAIL);
        
        // Fill in password
        console.log('🔐 Entering password...');
        await page.type('input[name="password"]', requiredEnvVars.F22_PASSWORD);
        
        // Click login button
        console.log('🔄 Clicking login button...');
        await page.click('button[type="submit"].chakra-button.css-1mk4yg');
        
        // Wait for login to complete by checking for Dashboard element
        console.log('⏳ Waiting for login to complete...');
        try {
            await page.waitForFunction(
                () => {
                    const dashboardElement = document.querySelector('span.font-medium.transition-opacity.duration-150');
                    return dashboardElement && dashboardElement.textContent.includes('Dashboard');
                },
                { timeout: 15000 }
            );
            console.log('✅ Login successful - Dashboard detected!');
        } catch (error) {
            console.log('⚠️ Dashboard element not found, trying alternative login detection...');
            // Fallback to navigation wait
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        }
        
        // Navigate to the API management page
        console.log('📍 Navigating to API management page...');
        await page.goto(requiredEnvVars.F22_API_URL, { waitUntil: 'networkidle2' });
        
        // Wait for the restart button to be available
        console.log('🔍 Looking for restart button...');
        await page.waitForSelector('button[aria-label="restart"]', { timeout: 15000 });
        
        // Scroll the restart button into view and ensure it's clickable
        console.log('📜 Scrolling restart button into view...');
        const restartButton = await page.$('button[aria-label="restart"]');
        await restartButton.scrollIntoView();
        
        // Wait a bit for any animations/loading to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try multiple click methods to ensure it works
        console.log('🔄 Clicking restart button...');
        try {
            // First try: Regular click
            await page.click('button[aria-label="restart"]');
        } catch (error) {
            console.log('⚠️ Regular click failed, trying JavaScript click...');
            // Fallback: JavaScript click
            await page.evaluate(() => {
                const button = document.querySelector('button[aria-label="restart"]');
                if (button) button.click();
            });
        }
        
        // Wait a moment to ensure the action is processed
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('✅ App restart initiated successfully!');
        
        // Optional: Wait for any confirmation or status change
        try {
            // You can add additional waits here if there are visual confirmations
            console.log('⏳ Waiting for restart confirmation...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.log('ℹ️ No specific confirmation detected, but restart was triggered.');
        }
        
    } catch (error) {
        console.error('❌ Error during automation:', error.message);
        console.error('🔍 Error details:', error.stack);
        
        throw error;
    } finally {
        await browser.close();
        console.log('🔒 Browser closed');
    }
}

// Handle command line execution
if (require.main === module) {
    restartF22LabsApp()
        .then(() => {
            console.log('🎉 Automation completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Automation failed:', error.message);
            process.exit(1);
        });
}

module.exports = restartF22LabsApp;
