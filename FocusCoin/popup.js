// popup.js - Handles popup UI and user interactions

class FocusPopup {
    constructor() {
        this.isActive = false;
        this.sessionStartTime = null;
        this.currentCoins = 0;
        
        this.initializeElements();
        this.bindEvents();
        this.loadData();
        this.updateCurrentSite();
    }

    initializeElements() {
        // Get DOM elements
        this.coinCountEl = document.getElementById('coinCount');
        this.currentSiteEl = document.getElementById('currentSite');
        this.siteTypeEl = document.getElementById('siteType');
        this.sessionTimerEl = document.getElementById('sessionTimer');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.todayCoinsEl = document.getElementById('todayCoins');
        this.focusStreakEl = document.getElementById('focusStreak');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startSession());
        this.stopBtn.addEventListener('click', () => this.stopSession());
        
        // Update display every second
        setInterval(() => this.updateSessionTimer(), 1000);
        setInterval(() => this.loadData(), 5000); // Refresh data every 5 seconds
    }

    async loadData() {
        try {
            // Get data from Chrome storage
            const result = await chrome.storage.local.get([
                'focusCoins', 
                'todayCoins', 
                'focusStreak', 
                'sessionActive',
                'sessionStartTime'
            ]);

            this.currentCoins = result.focusCoins || 0;
            this.isActive = result.sessionActive || false;
            this.sessionStartTime = result.sessionStartTime || null;

            // Update UI
            this.coinCountEl.textContent = this.currentCoins;
            this.todayCoinsEl.textContent = result.todayCoins || 0;
            this.focusStreakEl.textContent = result.focusStreak || 0;

            // Update button states
            if (this.isActive) {
                this.startBtn.style.display = 'none';
                this.stopBtn.style.display = 'block';
            } else {
                this.startBtn.style.display = 'block';
                this.stopBtn.style.display = 'none';
            }

        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async startSession() {
        try {
            const now = Date.now();
            
            // Save session state
            await chrome.storage.local.set({
                sessionActive: true,
                sessionStartTime: now
            });

            // Send message to background script
            await chrome.runtime.sendMessage({
                action: 'startSession',
                timestamp: now
            });

            this.isActive = true;
            this.sessionStartTime = now;
            
            // Update UI
            this.startBtn.style.display = 'none';
            this.stopBtn.style.display = 'block';
            
            console.log('Focus session started');
            
        } catch (error) {
            console.error('Error starting session:', error);
        }
    }

    async stopSession() {
        try {
            // Save session state
            await chrome.storage.local.set({
                sessionActive: false,
                sessionStartTime: null
            });

            // Send message to background script
            await chrome.runtime.sendMessage({
                action: 'stopSession'
            });

            this.isActive = false;
            this.sessionStartTime = null;
            
            // Update UI
            this.startBtn.style.display = 'block';
            this.stopBtn.style.display = 'none';
            this.sessionTimerEl.textContent = '00:00';
            
            console.log('Focus session stopped');
            
        } catch (error) {
            console.error('Error stopping session:', error);
        }
    }

    updateSessionTimer() {
        if (!this.isActive || !this.sessionStartTime) {
            this.sessionTimerEl.textContent = '00:00';
            return;
        }

        const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        this.sessionTimerEl.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async updateCurrentSite() {
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && tab.url) {
                const url = new URL(tab.url);
                const domain = url.hostname.replace('www.', '');
                
                this.currentSiteEl.textContent = domain;
                
                // Determine site type
                const siteType = this.getSiteType(domain);
                this.siteTypeEl.textContent = siteType.label;
                this.siteTypeEl.className = `site-type ${siteType.class}`;
                
            } else {
                this.currentSiteEl.textContent = 'Unknown';
                this.siteTypeEl.textContent = '';
                this.siteTypeEl.className = 'site-type';
            }
            
        } catch (error) {
            console.error('Error getting current site:', error);
            this.currentSiteEl.textContent = 'Error';
        }
    }

    getSiteType(domain) {
        // Productive sites (earn coins)
        const productiveSites = [
            'github.com', 'stackoverflow.com', 'wikipedia.org', 'leetcode.com',
            'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org',
            'developer.mozilla.org', 'w3schools.com', 'freecodecamp.org'
        ];

        // Distracting sites (spend coins)
        const distractingSites = [
            'youtube.com', 'instagram.com', 'twitter.com', 'facebook.com',
            'reddit.com', 'tiktok.com', 'netflix.com', 'twitch.tv',
            'discord.com', 'whatsapp.com'
        ];

        if (productiveSites.some(site => domain.includes(site))) {
            return { label: '✅ Productive', class: 'productive' };
        } else if (distractingSites.some(site => domain.includes(site))) {
            return { label: '❌ Distracting', class: 'distracting' };
        } else {
            return { label: '⚪ Neutral', class: 'neutral' };
        }
    }
}

// Initialize popup when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    new FocusPopup();
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'coinsUpdated') {
        // Update coin display with animation
        const coinEl = document.getElementById('coinCount');
        coinEl.textContent = message.coins;
        coinEl.classList.add('coin-earn');
        setTimeout(() => coinEl.classList.remove('coin-earn'), 500);
    }
});