// Hash router for VoiceRA SPA
// Exposes routing functionality to switch between views

// Utility to escape HTML
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Show a specific view and hide others
function showView(viewId) {
	// Hide all views
	document.querySelectorAll('.view').forEach((view) => {
		view.classList.add('hidden');
	});

	// Show the requested view
	const viewElement = document.getElementById(viewId);
	if (viewElement) {
		viewElement.classList.remove('hidden');
	}
}

// Route based on hash
function route() {
	const hash = window.location.hash;

	if (hash === '#/chat') {
		showView('view-chat');
		if (typeof chatPage !== 'undefined' && chatPage.init) {
			chatPage.init();
		}
	} else if (hash === '#/voices' || hash === '') {
		showView('view-voices');
		if (typeof voicesPage !== 'undefined' && voicesPage.init) {
			voicesPage.init();
		}
	} else {
		// Default to voices view
		window.location.hash = '#/voices';
	}
}

// Initialize routing when DOM is loaded
document.addEventListener('DOMContentLoaded', route);

// Handle hash changes
window.addEventListener('hashchange', route);
