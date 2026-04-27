const puppeteer = require('puppeteer-core');
require('dotenv').config();

async function restartF22LabsApp() {
    const navigationTimeout = parseInt(process.env.F22_NAVIGATION_TIMEOUT_MS, 10) || 45000;
    const actionTimeout = parseInt(process.env.F22_ACTION_TIMEOUT_MS, 10) || 30000;
    const runHeadless = process.env.F22_HEADLESS !== 'false';

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
        throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    const browser = await puppeteer.launch({
        headless: runHeadless,
        defaultViewport: null,
        executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium',
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
        page.setDefaultNavigationTimeout(navigationTimeout);
        page.setDefaultTimeout(actionTimeout);

        console.log('🚀 Starting F22 Labs app restart automation...');

        console.log('📍 Navigating to F22 Labs login page...');
        await page.goto(requiredEnvVars.F22_LOGIN_URL, {
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout
        });

        await page.waitForSelector('input[name="email"]', { timeout: actionTimeout });

        console.log('📧 Entering email...');
        await page.type('input[name="email"]', requiredEnvVars.F22_EMAIL);

        console.log('🔐 Entering password...');
        await page.type('input[name="password"]', requiredEnvVars.F22_PASSWORD);

        console.log('🔄 Clicking login button...');
        await page.click('button[type="submit"]');

        console.log('⏳ Waiting for login to complete...');
        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: navigationTimeout }),
                page.waitForFunction(
                    () => window.location.href.includes('/projects') || window.location.href.includes('/dashboard'),
                    { timeout: actionTimeout }
                ),
                page.waitForFunction(
                    () => {
                        const dashboardElement = document.querySelector('span.font-medium.transition-opacity.duration-150');
                        return dashboardElement && dashboardElement.textContent.includes('Dashboard');
                    },
                    { timeout: actionTimeout }
                )
            ]);
            console.log('✅ Login successful');
        } catch (error) {
            console.log('⚠️ Could not confirm login state via navigation/selector; proceeding to app page...');
        }

        console.log('📍 Navigating to API management page...');
        await page.goto(requiredEnvVars.F22_API_URL, {
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout
        });

        console.log('🔍 Looking for restart button...');
        await page.waitForSelector('button[aria-label="restart"]', { timeout: actionTimeout });

        console.log('📜 Scrolling restart button into view...');
        const restartButton = await page.$('button[aria-label="restart"]');
        await restartButton.scrollIntoView();

        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('🔄 Clicking restart button...');
        try {
            await page.click('button[aria-label="restart"]');
        } catch (error) {
            console.log('⚠️ Regular click failed, trying JavaScript click...');
            await page.evaluate(() => {
                const button = document.querySelector('button[aria-label="restart"]');
                if (button) button.click();
            });
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('✅ App restart initiated successfully!');
    } catch (error) {
        console.error('❌ Error during automation:', error.message);
        console.error('🔍 Error details:', error.stack);
        throw error;
    } finally {
        await browser.close();
        console.log('🔒 Browser closed');
    }
}

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
