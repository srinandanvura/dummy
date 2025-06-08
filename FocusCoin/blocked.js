// blocked.js - External JavaScript for blocked.html

// Get blocked site from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const site = urlParams.get('site');

// Update the blocked site display
if (site) {
    document.getElementById('blockedSite').textContent = site;
}

// Add event listener for the return button
document.addEventListener('DOMContentLoaded', function() {
    const returnButton = document.querySelector('.btn');
    if (returnButton) {
        returnButton.addEventListener('click', function(e) {
            e.preventDefault();
            window.close();
        });
    }
});

// Auto-refresh page every 30 seconds to check for coins
setTimeout(() => {
    window.location.reload();
}, 30000);