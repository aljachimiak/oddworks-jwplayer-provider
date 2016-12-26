'use strict';

/* eslint-disable camelcase */

const debug = require('debug')('oddworks:provider:jwplayer:fetch-jwplayer-playlist');

module.exports = function (bus, client, transform) {
	return function fetchChannelCollection(args) {
		const spec = args.spec;
		const channel = args.channel;
		const secrets = (args.channel.secrets || {}).jwPlatform || {};
		const playlistId = args.spec.playlist.key;
		let collection;

		const maxResults = client.maxResults;

		const playlistArgs = {
			playlistId,
			apiKey: secrets.apiKey || client.apiKey,
			secretKey: secrets.secretKey || client.secretKey
		};

		debug(`Getting Playlist - playlistId: ${playlistId}`);
		// First, get the channel object from jwplayer.
		return client.getPlaylist(playlistArgs)
			.then(playlist => {
				if (playlist) {
					// If the playlist object exists, cast it to an Oddworks collection.
					collection = transform(spec, playlist.channel);

					const videos = (playlist.channel || {}).videos || {};
					const total = videos.total || 0;

					if (total > maxResults) {
						debug(`Playlist has ${total} videos, which is more than ${maxResults} - playlistId: ${playlistId}`);
						playlistArgs.query = {
							result_limit: maxResults
						};

						const promises = [];
						let offset = 0;

						while ((offset) < total) {
							playlistArgs.query.result_offset = offset;

							debug(`Getting Videos By Playlist - playlistId: ${playlistId}`);
							debug(`query: %o`, playlistArgs.query);
							promises.push(client.getVideosByPlaylist(playlistArgs)
								.then(res => {
									return res.videos || [];
								}));
							offset += maxResults;
						}

						return Promise.all(promises)
							.then(results => {
								return results.reduce((a, b) => {
									return a.concat(b);
								});
							})
							.then(results => {
								return Object.assign({videos: results});
							});
					}

					if (total === 0) {
						debug(`Zero (0) Videos in Playlist - playlistId: ${playlistId}`);
					}

					playlistArgs.query = {
						result_limit: total
					};

					debug(`Getting Videos By Playlist - playlistId: ${playlistId}`);
					debug(`query: %o`, playlistArgs.query);
					return client.getVideosByPlaylist(playlistArgs);
				}

				const error = new Error(`JW Player channel not found for id "${playlistId}"`);
				error.code = 'JW_CHANNEL_PLAYLIST_NOT_FOUND';

				// Report the JW_CHANNEL_PLAYLIST_NOT_FOUND error.
				bus.broadcast({level: 'error'}, {
					spec,
					error,
					code: error.code,
					message: 'playlist not found'
				});

				// Return a rejection to short circuit the rest of the operation.
				return Promise.reject(error);
			})
			.then(result => {
				const videos = result.videos || [];
				const role = 'catalog';
				const cmd = 'setItemSpec';
				const type = 'videoSpec';
				const source = 'jwplayer-video-provider';

				if (videos && videos.length) {
					return Promise.all(videos.map(video => {
						const videoSpec = {
							channel: channel.id,
							type,
							id: `spec-jw-video-${video.key}`,
							source,
							video
						};
						return bus.sendCommand({role, cmd}, videoSpec);
					}));
				}

				return [];
			})
			.then(videoSpecs => {
				collection.relationships = collection.relationships || {};

				// Assign the relationships.
				collection.relationships.entities = {
					data: videoSpecs.map(spec => {
						return {
							type: spec.type.replace(/Spec$/, ''),
							id: spec.resource
						};
					})
				};

				return collection;
			});
	};
};
