'use strict';

/* eslint-disable camelcase */

const Promise = require('bluebird');
const debug = require('debug')('oddworks:provider:jwplayer:fetch-jwplayer-video');

module.exports = function (bus, client, transform) {
	return function fetchVideo(args) {
		const secrets = (args.channel.secrets || {}).jwPlatform || {};
		const spec = args.spec;
		const videoId = args.spec.video.key;
		const maxResults = client.maxResults;
		const video = {};

		const videoArgs = {
			videoId,
			apiKey: secrets.apiKey || client.apiKey,
			secretKey: secrets.secretKey || client.secretKey
		};

		debug(`Getting Video - videoId: ${videoId}`);
		return client.getVideo(videoArgs)
			.then(videoRes => {
				if (videoRes) {
					video  = videoRes;
					videoArgs.query = {result_limit: maxResults};
					// to limit api usage, only get conversions if a video exists
					debug(`Getting Conversions for Video - videoId: ${videoId}`);
					return client.getConversionsByVideo(videoArgs)
						.then(conversions => {
							const videoConversions = conversions.conversions || [];
							const total = videos.total || 0;

							if (total > maxResults) {
								debug(`Video has ${total} conversions, which is more than ${maxResults} - videoId: ${videoId}`);
								
								const promises = [];
								let offset = 0;

								while ((offset) < total) {
									videoArgs.query.result_offset = offset;

									debug(`Getting Conversions for Video - playlistId: ${videoId}`);
									debug(`query: %o`, videoArgs.query);
									promises.push(client.getConversionsByVideo(videoArgs))
										.then(res => {
											return res.conversions || [];
										});
									offset += maxResults;
								}
								return Promise.all(promises)
									.then(results => {
										return results.reduce((a, b) => {
											// videoConversions
											return a.concat(b);
										})
									});
							}
							return videoConversions;
						})
						.then(conversions => {
							return transform({
								spec,
								video: video,
								conversions: videoConversions
							});
						});
				}

				const error = new Error(`Video not found for id "${videoId}"`);
				error.code = 'VIDEO_NOT_FOUND';

				bus.broadcast({level: 'error'}, {
					spec,
					error,
					code: error.code,
					message: 'video not found'
				});

				return Promise.reject(error);
			});
	};
};
