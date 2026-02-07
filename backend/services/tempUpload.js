// services/tempUpload.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Uploads a buffer to a temporary public host so APIs can read it.
 * Uses tmpfiles.org (files expire automatically after 60 mins)
 */
async function uploadToPublicUrl(buffer, filename) {
	try {
		const form = new FormData();
		form.append('file', buffer, filename);

		// Upload to tmpfiles.org
		const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
			headers: { ...form.getHeaders() },
		});

		if (response.data && response.data.status === 'success') {
			// tmpfiles returns a display URL, we need the raw download URL
			// Logic: Replace "tmpfiles.org/" with "tmpfiles.org/dl/"
			const displayUrl = response.data.data.url;
			const downloadUrl = displayUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');

			console.log(`🔗 Public URL created: ${downloadUrl}`);
			return downloadUrl;
		} else {
			throw new Error('Upload provider returned error');
		}
	} catch (error) {
		console.error('❌ Temp upload failed:', error.message);
		throw new Error('Failed to create public URL for audio file. Qwen requires a public URL.');
	}
}

module.exports = { uploadToPublicUrl };
