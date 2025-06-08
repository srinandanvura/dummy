// background.js - Core extension logic that runs continuously

class FocusCoinEngine {
    constructor() {
        this.isSessionActive = false;
        this.currentTabId = null;
        this.lastUpdateTime = Date.now();
        this.coinUpdateInterval = 5000; // 5 seconds in milliseconds
        this.updateTimer = null; // For setInterval
        
        this.productiveSites = [
            'github.com', 'stackoverflow.com', 'wikipedia.org', 'leetcode.com',
            'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org',
            'developer.mozilla.org', 'w3schools.com', 'freecodecamp.org'
        ];
        
        this.distractingSites = [
            'youtube.com', 'instagram.com', 'twitter.com', 'facebook.com',
            'reddit.com', 'tiktok.com', 'netflix.com', 'twitch.tv',
            'discord.com', 'whatsapp.com'
        ];

        this.initialize();
    }

    async initialize() {
        // Initialize storage with default values
        const result = await chrome.storage.local.get([
            'focusCoins', 'todayCoins', 'focusStreak', 'sessionActive'
        ]);

        if (result.focusCoins === undefined) {
            await chrome.storage.local.set({
                focusCoins: 10, // Start with 10 coins
                todayCoins: 0,
                focusStreak: 0,
                sessionActive: false,
                lastActiveDate: new Date().toDateString()
            });
        }

        // Restore session state
        this.isSessionActive = result.sessionActive || false;
        
        // Set up listeners
        this.setupListeners();
        
        // Start monitoring if session is active
        if (this.isSessionActive) {
            this.startMonitoring();
        }

        console.log('Focus Coin Engine initialized');
    }

    setupListeners() {
        // Listen for tab changes
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.currentTabId = activeInfo.tabId;
            this.handleTabChange();
        });

        // Listen for tab updates (URL changes)
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (tabId === this.currentTabId && changeInfo.url) {
                this.handleTabChange();
            }
        });

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });

        // Remove chrome.alarms - we'll use setInterval instead for instant updates
    }

    async handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'startSession':
                await this.startSession();
                break;
            case 'stopSession':
                await this.stopSession();
                break;
            case 'getCoins':
                // New message to get current coins instantly
                const result = await chrome.storage.local.get(['focusCoins', 'todayCoins']);
                sendResponse({
                    focusCoins: result.focusCoins || 0,
                    todayCoins: result.todayCoins || 0
                });
                break;
            default:
                console.log('Unknown message:', message);
        }
    }

    async startSession() {
        this.isSessionActive = true;
        this.lastUpdateTime = Date.now();
        
        await chrome.storage.local.set({
            sessionActive: true,
            sessionStartTime: this.lastUpdateTime
        });
        
        this.startMonitoring();
        console.log('Focus session started in background');
    }

    async stopSession() {
        this.isSessionActive = false;
        
        // Clear the interval timer
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        
        await chrome.storage.local.set({
            sessionActive: false,
            sessionStartTime: null
        });
        
        console.log('Focus session stopped in background');
    }

    startMonitoring() {
        // Clear any existing timer
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // Update coins immediately when starting
        this.updateCoins();
        
        // Set up interval to update every 5 seconds
        this.updateTimer = setInterval(() => {
            this.updateCoins();
        }, this.coinUpdateInterval);
        
        console.log('Started monitoring with 5-second intervals');
    }

    async handleTabChange() {
        if (!this.isSessionActive) return;
        
        // Reset the timer when tab changes for instant response
        this.lastUpdateTime = Date.now();
        
        // Update coins immediately on tab change
        this.updateCoins();
    }

    async updateCoins() {
        if (!this.isSessionActive) return;

        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url) return;

            const url = new URL(tab.url);
            const domain = url.hostname.replace('www.', '');
            const siteType = this.getSiteType(domain);
            
            // Skip neutral sites - no coin updates
            if (siteType === 'neutral') {
                console.log(`Neutral site ${domain} - no coin change`);
                return;
            }
            
            // Get current coin balance
            const result = await chrome.storage.local.get(['focusCoins', 'todayCoins']);
            let currentCoins = result.focusCoins || 0;
            let todayCoins = result.todayCoins || 0;

            // Calculate time since last update
            const now = Date.now();
            const timeDiff = now - this.lastUpdateTime;
            const intervalsElapsed = Math.floor(timeDiff / this.coinUpdateInterval);

            if (intervalsElapsed > 0) {
                let coinChange = 0;

                if (siteType === 'productive') {
                    // Earn 3 coins per 5-second interval on productive sites
                    coinChange = intervalsElapsed * 3;
                    currentCoins += coinChange;
                    todayCoins += coinChange;
                    
                    console.log(`Earned ${coinChange} coins on ${domain}`);
                    
                } else if (siteType === 'distracting') {
                    // Spend 4 coins per 5-second interval on distracting sites
                    coinChange = intervalsElapsed * -4;
                    
                    if (currentCoins > 0) {
                        currentCoins = Math.max(0, currentCoins + coinChange);
                        console.log(`Spent ${Math.abs(coinChange)} coins on ${domain}`);
                    } else {
                        // No coins left - block the site
                        await this.blockSite(tab, domain);
                        return;
                    }
                }

                // Save updated coins
                await chrome.storage.local.set({
                    focusCoins: currentCoins,
                    todayCoins: todayCoins
                });

                // Notify popup of coin update instantly
                try {
                    await chrome.runtime.sendMessage({
                        action: 'coinsUpdated',
                        coins: currentCoins,
                        change: coinChange,
                        siteType: siteType,
                        domain: domain
                    });
                } catch (error) {
                    // Popup might be closed, ignore error
                }

                this.lastUpdateTime = now;
            }

        } catch (error) {
            console.error('Error updating coins:', error);
        }
    }

    getSiteType(domain) {
        if (this.productiveSites.some(site => domain.includes(site))) {
            return 'productive';
        } else if (this.distractingSites.some(site => domain.includes(site))) {
            return 'distracting';
        } else {
            return 'neutral';
        }
    }

    async blockSite(tab, domain) {
        // Create a blocking page URL
        const blockingPageUrl = chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(domain);
        
        // Redirect to blocking page
        try {
            await chrome.tabs.update(tab.id, { url: blockingPageUrl });
            console.log(`Blocked access to ${domain} - no coins remaining`);
        } catch (error) {
            console.error('Error blocking site:', error);
        }
    }
}

// Initialize the engine when extension starts
const focusEngine = new FocusCoinEngine();