'use strict';

const Promise = require('bluebird');
const test = require('ava');
const nock = require('nock');

const provider = require('../');
const collectionTransform = require('../lib/default-collection-transform');
const playlistResponse = require('./fixtures/example-responses/get-playlist-response');
const videoResponse0 = require('./fixtures/example-responses/get-videos-limit-offset-0');
const videoResponse3 = require('./fixtures/example-responses/get-videos-limit-offset-3');
const videoResponse6 = require('./fixtures/example-responses/get-videos-limit-offset-6');
const helpers = require('./helpers');

const apiKey = 'fake-apiKey';
const secretKey = 'fake-secretKey';
const baseUrl = 'https://api.jwplatform.com';
const PATH_PREFIX = '/v1';

// mock channel fetching function
const channelId = 'fake-channel';
const getChannel = () => {
	return Promise.resolve({
		id: channelId,
		secrets: {
			brightcove: {
				apiKey,
				secretKey
			}
		}
	});
};

let bus;
let playlistHandler = null;

test.before(() => {
	// mock API calls
	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/channels/show`)
		.query(params => {
			return params.channel_key === 'bITKS2O3';
		})
		.reply(200, playlistResponse);

	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/channels/videos/list`)
		.query(q => {
			return parseInt(q.result_offset, 10) === 0;
		})
		.reply(200, videoResponse0);

	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/channels/videos/list`)
		.query(q => {
			return parseInt(q.result_offset, 10) === 3;
		})
		.reply(200, videoResponse3);

	nock(
		`${baseUrl}${PATH_PREFIX}`, {})
		.get(`/channels/videos/list`)
		.query(q => {
			return parseInt(q.result_offset, 10) === 6;
		})
		.reply(200, videoResponse6);
});

test.beforeEach(() => {
	bus = helpers.createBus();

	// mock command for creating a video spec
	bus.commandHandler({role: 'catalog', cmd: 'setItemSpec'}, spec => {
		return Promise.resolve({type: 'videoSpec', resource: `${spec.video.key}`});
	});

	// example results for this test are based on a maxResults of 3
	const client = provider.createClient({
		bus,
		apiKey: 'foo',
		secretKey: 'bar',
		maxResults: 3
	});

	// create handler
	playlistHandler = provider.createPlaylistHandler(bus, getChannel, client, collectionTransform);
});

test('when JWPlayer playlist found', t => {
	const spec = {
		channel: channelId,
		type: 'collectionSpec',
		playlistId: `spec-jwplayer-playlist-${playlistResponse.channel.key}`,
		playlist: {key: playlistResponse.channel.key}
	};

	return playlistHandler({spec})
		.then(res => {
			const keys = Object.keys(res);
			t.deepEqual(keys, [
				'id',
				'title',
				'type',
				'description',
				'genres',
				'images',
				'meta',
				'releaseDate',
				'relationships'
			]);

			// videos are present in relationships
			// Oddworks will ensure these IDs get prefixed with "res-jw-video-".
			t.is(res.relationships.entities.data.length, 8);
		});
});
